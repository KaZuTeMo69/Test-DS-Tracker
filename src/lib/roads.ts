import { Store } from "../types";
import { LatLng } from "./coords";
import { hasCoords } from "./checks";
import { isLive } from "./status";

/**
 * Road distances and routes from free services: OpenRouteService when the user has added a (free) key in
 * Settings, otherwise, or when it fails, the public OSRM server. Only the points' coordinates are sent.
 */

export type RoadService = "ors" | "osrm";

export const SERVICE_NAME: Record<RoadService, string> = {
  ors: "OpenRouteService",
  osrm: "the public OSRM server",
};

const ORS = "https://api.openrouteservice.org/v2";
export const OSRM = "https://router.project-osrm.org";
export const OSRM_ROUTE_URL = `${OSRM}/route/v1`;

// What went wrong, in the terms the messages use
export type RoadErrorKind = "key" | "rate-limit" | "network" | "no-route" | "failed";

export class RoadError extends Error {
  constructor(
    readonly kind: RoadErrorKind,
    readonly service: RoadService,
    message: string = kind,
  ) {
    super(message);
    this.name = "RoadError";
  }
}

/** Every service was tried and none worked; the failures in the order they happened. */
export class RoadsFailed extends Error {
  constructor(readonly failures: RoadError[]) {
    super(failures.map((f) => `${f.service}: ${f.message}`).join("; "));
    this.name = "RoadsFailed";
  }
  /** The failure to explain: the last service's, which is the one the user was left with. */
  get last(): RoadError {
    return this.failures[this.failures.length - 1];
  }
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

// ── Which service, in which order ──

/** OpenRouteService first when there's a key, then the public OSRM server; only OSRM without a key. */
export const servicesFor = (orsKey: string): RoadService[] => (orsKey.trim() ? ["ors", "osrm"] : ["osrm"]);

export interface Fallback<T> {
  result: T;
  service: RoadService; // the one that answered
  failures: RoadError[]; // the ones tried before it
}

/**
 * Tries each service in turn until one answers. A request cancelled on purpose (the user moved on) stops
 * there instead of trying the next service.
 */
export async function withFallback<T>(
  services: RoadService[],
  attempt: (service: RoadService) => Promise<T>,
): Promise<Fallback<T>> {
  const failures: RoadError[] = [];
  for (const service of services) {
    try {
      return { result: await attempt(service), service, failures };
    } catch (e) {
      if (isAbort(e)) throw e;
      failures.push(e instanceof RoadError ? e : new RoadError("network", service, String(e)));
    }
  }
  throw new RoadsFailed(failures);
}

// ── Talking to the services ──

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface Request {
  fetcher?: Fetcher;
  signal?: AbortSignal;
  orsKey?: string;
}

// A failed fetch (offline, blocked, CORS) is a network problem; a cancelled one is passed on as it is
async function call(service: RoadService, url: string, init: RequestInit, fetcher: Fetcher = fetch): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new RoadError("network", service, e instanceof Error ? e.message : String(e));
  }
}

async function jsonOf(res: Response, service: RoadService): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new RoadError("failed", service, `unreadable answer (HTTP ${res.status})`);
  }
}

// OpenRouteService's answer to a request it didn't carry out
async function orsError(res: Response): Promise<RoadError> {
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  const err = (body as { error?: { code?: number; message?: string } | string }).error;
  const code = typeof err === "object" ? err?.code : undefined;
  const message = (typeof err === "object" ? err?.message : err) || `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) return new RoadError("key", "ors", message);
  if (res.status === 429) return new RoadError("rate-limit", "ors", message);
  // 2009: no route; 2010: no road near a point; 2004: too far apart
  if (res.status === 404 || code === 2009 || code === 2010 || code === 2004)
    return new RoadError("no-route", "ors", message);
  return new RoadError("failed", "ors", message);
}

function osrmStatusError(res: Response): RoadError | null {
  if (res.status === 429) return new RoadError("rate-limit", "osrm", "HTTP 429");
  if (res.status >= 500) return new RoadError("failed", "osrm", `HTTP ${res.status}`);
  return null;
}

// OSRM answers with a code; anything other than Ok means it didn't find a way
function osrmCodeError(data: Record<string, unknown>): RoadError | null {
  const code = data.code as string | undefined;
  if (code === "Ok") return null;
  const message = (data.message as string) || code || "no answer";
  return new RoadError(
    code === "NoRoute" || code === "NoSegment" || code === "NoTable" ? "no-route" : "failed",
    "osrm",
    message,
  );
}

const lngLat = (p: LatLng) => [p.lng, p.lat];
const osrmCoords = (points: LatLng[]) => points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");

// ── A route between two points ──

export interface RouteStep {
  text: string;
  distance: number; // m
  duration: number; // s
  type: number; // OpenRouteService's instruction type (0 left, 1 right, … 10 arrive, 11 depart)
  road: string;
  index: number; // where on the line it starts
}

export interface RoadRoute {
  distance: number; // m
  duration: number; // s
  line: [number, number][]; // lat, lng
  steps: RouteStep[];
}

interface OrsFeature {
  geometry: { coordinates: [number, number][] };
  properties: {
    summary?: { distance?: number; duration?: number };
    segments?: {
      steps?: {
        instruction: string;
        distance: number;
        duration: number;
        type: number;
        name: string;
        way_points: number[];
      }[];
    }[];
  };
}

async function orsRoute(from: LatLng, to: LatLng, { fetcher, signal, orsKey = "" }: Request): Promise<RoadRoute> {
  const res = await call(
    "ors",
    `${ORS}/directions/driving-car/geojson`,
    {
      method: "POST",
      headers: {
        Authorization: orsKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({ coordinates: [lngLat(from), lngLat(to)], instructions: true }),
      signal,
    },
    fetcher,
  );
  if (!res.ok) throw await orsError(res);
  const data = await jsonOf(res, "ors");
  const feature = (data.features as OrsFeature[] | undefined)?.[0];
  if (!feature) throw new RoadError("no-route", "ors", "no route in the answer");
  const summary = feature.properties.summary ?? {};
  return {
    distance: summary.distance ?? 0,
    duration: summary.duration ?? 0,
    line: feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    steps: (feature.properties.segments ?? []).flatMap((segment) =>
      (segment.steps ?? []).map((s) => ({
        text: s.instruction,
        distance: s.distance,
        duration: s.duration,
        type: s.type,
        road: s.name && s.name !== "-" ? s.name : "",
        index: s.way_points?.[0] ?? 0,
      })),
    ),
  };
}

async function osrmRoute(from: LatLng, to: LatLng, { fetcher, signal }: Request): Promise<RoadRoute> {
  const url = `${OSRM_ROUTE_URL}/driving/${osrmCoords([from, to])}?overview=full&geometries=geojson`;
  const res = await call("osrm", url, { signal }, fetcher);
  const statusError = osrmStatusError(res);
  if (statusError) throw statusError;
  const data = await jsonOf(res, "osrm");
  const codeError = osrmCodeError(data);
  if (codeError) throw codeError;
  const route = (
    data.routes as { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
  )?.[0];
  if (!route) throw new RoadError("no-route", "osrm", "no route in the answer");
  return {
    distance: route.distance,
    duration: route.duration,
    line: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    steps: [],
  };
}

/** The driving route from one service (the fallback is the caller's). */
export const routeVia = (service: RoadService, from: LatLng, to: LatLng, request: Request = {}) =>
  service === "ors" ? orsRoute(from, to, request) : osrmRoute(from, to, request);

/** The driving route between two points, from the first service that answers. */
export function roadRoute(from: LatLng, to: LatLng, request: Request = {}): Promise<Fallback<RoadRoute>> {
  return withFallback(servicesFor(request.orsKey ?? ""), (service) =>
    service === "ors" ? orsRoute(from, to, request) : osrmRoute(from, to, request),
  );
}

// ── Road distances from one point to several (one request) ──

export interface RoadLeg {
  distance: number | null; // m; null when there's no road route
  duration: number | null; // s
}

async function orsMatrix(
  origin: LatLng,
  targets: LatLng[],
  { fetcher, signal, orsKey = "" }: Request,
): Promise<RoadLeg[]> {
  const res = await call(
    "ors",
    `${ORS}/matrix/driving-car`,
    {
      method: "POST",
      headers: { Authorization: orsKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        locations: [origin, ...targets].map(lngLat),
        sources: [0],
        destinations: targets.map((_, i) => i + 1),
        metrics: ["distance", "duration"],
      }),
      signal,
    },
    fetcher,
  );
  if (!res.ok) throw await orsError(res);
  const data = await jsonOf(res, "ors");
  const distances = (data.distances as (number | null)[][] | undefined)?.[0];
  const durations = (data.durations as (number | null)[][] | undefined)?.[0];
  if (!distances || distances.length !== targets.length)
    throw new RoadError("failed", "ors", "unexpected matrix answer");
  return targets.map((_, i) => ({ distance: distances[i] ?? null, duration: durations?.[i] ?? null }));
}

async function osrmTable(origin: LatLng, targets: LatLng[], { fetcher, signal }: Request): Promise<RoadLeg[]> {
  const destinations = targets.map((_, i) => i + 1).join(";");
  const url = `${OSRM}/table/v1/driving/${osrmCoords([origin, ...targets])}?sources=0&destinations=${destinations}&annotations=distance,duration`;
  const res = await call("osrm", url, { signal }, fetcher);
  const statusError = osrmStatusError(res);
  if (statusError) throw statusError;
  const data = await jsonOf(res, "osrm");
  const codeError = osrmCodeError(data);
  if (codeError) throw codeError;
  const distances = (data.distances as (number | null)[][] | undefined)?.[0];
  const durations = (data.durations as (number | null)[][] | undefined)?.[0];
  if (!distances || distances.length !== targets.length)
    throw new RoadError("failed", "osrm", "unexpected table answer");
  return targets.map((_, i) => ({ distance: distances[i] ?? null, duration: durations?.[i] ?? null }));
}

/** Road distance and drive time from `origin` to each target, in one request, from the first service that answers. */
export function roadLegs(origin: LatLng, targets: LatLng[], request: Request = {}): Promise<Fallback<RoadLeg[]>> {
  if (!targets.length)
    return Promise.resolve({ result: [], service: servicesFor(request.orsKey ?? "")[0], failures: [] });
  return withFallback(servicesFor(request.orsKey ?? ""), (service) =>
    service === "ors" ? orsMatrix(origin, targets, request) : osrmTable(origin, targets, request),
  );
}

// ── Straight-line distance, and the stores to ask about ──

const EARTH_RADIUS = 6_371_008.8; // m

/** The straight-line (great-circle) distance between two points, in metres. */
export function airDistance(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearbyStore {
  store: Store;
  air: number; // m
}

/**
 * The live stores closest to a point in a straight line, nearest first: the ones worth asking the road
 * service about. Stores without a location, stores that aren't live, and the store itself are left out.
 */
export function nearestByAir(point: LatLng, stores: Store[], count = 5, excludeId?: number): NearbyStore[] {
  const found: NearbyStore[] = [];
  for (const store of stores) {
    if (store.id === excludeId || !hasCoords(store) || !isLive(store)) continue;
    found.push({ store, air: airDistance(point, { lat: store.lat!, lng: store.lng! }) });
  }
  return found.sort((a, b) => a.air - b.air || a.store.id - b.store.id).slice(0, count);
}

// ── Remembering answers for this visit ──

/**
 * Answers kept in memory for as long as the page is open, so opening the same store again doesn't ask again.
 * A request still on its way is shared; a failed one is forgotten, so the next try asks again.
 */
export function createCache<T>() {
  const answers = new Map<string, Promise<T>>();
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      let answer = answers.get(key);
      if (!answer) {
        answer = load();
        answers.set(key, answer);
        answer.catch(() => answers.delete(key));
      }
      return answer;
    },
    has: (key: string) => answers.has(key),
    clear: () => answers.clear(),
    get size() {
      return answers.size;
    },
  };
}

/** The cache key for road distances from a point to some stores (about a metre's precision). */
export const legsKey = (point: LatLng, storeIds: number[]) =>
  `${point.lat.toFixed(5)},${point.lng.toFixed(5)}>${storeIds.join(",")}`;

// ── Words and links ──

/** "850 m", "12.4 km", "143 km", "1,096 km" */
export function formatKm(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  const km = metres / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km).toLocaleString("en-US")} km`;
}

/** "4 min", "1 h 05 min" */
export function formatDrive(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

const at = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** The exact spot as a pin in Google Maps, no route (a plain link: no key, no Google code in the app). */
export const googleMapsPlace = (point: LatLng) => `https://www.google.com/maps/search/?api=1&query=${at(point)}`;

/** Driving directions in Google Maps (a plain link: no key, no Google code in the app). */
export const googleMapsDirections = (origin: LatLng, destination: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&origin=${at(origin)}&destination=${at(destination)}&travelmode=driving`;

// What the toasts say. `what` is what was asked for ("the route", "the road distances")
const WHY: Record<RoadErrorKind, string> = {
  key: "didn't accept the API key (check it in Settings)",
  "rate-limit": "has reached its free limit for now",
  network: "couldn't be reached",
  "no-route": "found no road route",
  failed: "had a problem",
};

/** After a fallback: which service was used, and why the first one wasn't. */
export function fallbackMessage(result: Pick<Fallback<unknown>, "service" | "failures">, what: string): string | null {
  const first = result.failures[0];
  if (!first) return null;
  return `OpenRouteService ${WHY[first.kind]}, so ${what} came from ${SERVICE_NAME[result.service]}`;
}

const REASON: Record<RoadErrorKind, string> = {
  "no-route": "no road route between these points (one may be too far from a road)",
  "rate-limit": "the routing service is busy (rate limit). Try again in a minute",
  network: "couldn't reach the routing service. Check your connection and try again",
  key: "OpenRouteService refused the API key. Check it in Settings",
  failed: "the routing service had a problem. Try again in a moment",
};

/** When no service could answer: "Route unavailable: no road route between these points …". */
export function failureMessage(error: unknown, label: string): string {
  const last = error instanceof RoadsFailed ? error.last : error instanceof RoadError ? error : null;
  return `${label} unavailable: ${REASON[last?.kind ?? "failed"]}`;
}

// ── Checking an OpenRouteService key ──

export type KeyCheck = "ok" | RoadErrorKind;

// Two points a few hundred metres apart in central Riyadh: the smallest route there is to ask for
const CHECK_FROM: LatLng = { lat: 24.7136, lng: 46.6753 };
const CHECK_TO: LatLng = { lat: 24.7166, lng: 46.6783 };

/** Whether OpenRouteService takes this key: one tiny route, asked of ORS alone (no fallback). */
export async function checkOrsKey(orsKey: string, request: Omit<Request, "orsKey"> = {}): Promise<KeyCheck> {
  try {
    await orsRoute(CHECK_FROM, CHECK_TO, { ...request, orsKey: orsKey.trim() });
    return "ok";
  } catch (e) {
    if (isAbort(e)) throw e;
    // A route not found still means the key was accepted
    if (e instanceof RoadError) return e.kind === "no-route" ? "ok" : e.kind;
    return "failed";
  }
}

export const KEY_CHECK_MESSAGE: Record<KeyCheck, string> = {
  ok: "Key works: routes and road distances now come from OpenRouteService.",
  key: "OpenRouteService refused this key. Copy the key from your openrouteservice.org dashboard (a CARTO key won't work). Until then, routes use the public OSRM server.",
  "rate-limit":
    "OpenRouteService accepted the key, but its free daily limit is used up. Routes use the public OSRM server until it resets.",
  network: "Couldn't reach OpenRouteService to check the key. Check your connection and try again.",
  "no-route": "Key works: routes and road distances now come from OpenRouteService.",
  failed: "OpenRouteService had a problem checking the key. Try again in a minute.",
};
