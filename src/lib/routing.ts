import L from "leaflet";
import { tellOutcome, RoadsSetup } from "../hooks/useRoads";
import {
  failureMessage,
  OSRM_ROUTE_URL,
  RoadError,
  RoadRoute,
  RoadService,
  routeVia,
  servicesFor,
  withFallback,
} from "./roads";

// Leaflet Routing Machine is large (its driving directions come in many languages), so it's downloaded
// only when the first route is drawn instead of with the app
let routingReady: Promise<void> | null = null;

function loadRouting(): Promise<void> {
  // The plugin finds Leaflet on window.L, which Leaflet sets itself when it loads
  routingReady ??= Promise.all([
    import("leaflet-routing-machine"),
    import("leaflet-routing-machine/dist/leaflet-routing-machine.css"),
  ])
    .then(() => undefined)
    .catch((err) => {
      routingReady = null; // try again next time
      throw err;
    });
  return routingReady;
}

// The route currently drawn on the map (one at a time), and a counter that tells a route still
// loading that it was cleared or replaced in the meantime
let activeRoute: L.Routing.Control | null = null;
let routeRequest = 0;

export function clearRoute(map: L.Map) {
  routeRequest++;
  if (!activeRoute) return;
  try {
    map.removeControl(activeRoute);
  } catch (e) {
    console.warn("Error removing routing control", e);
  }
  activeRoute = null;
}

/** What the route on the map is: its length and drive time, and where it came from. */
export interface RouteInfo {
  distance: number; // m
  duration: number; // s
  service: RoadService;
}

// OpenRouteService's instruction types, as the plugin's icons know them
const ORS_TURN = [
  "Left",
  "Right",
  "SharpLeft",
  "SharpRight",
  "SlightLeft",
  "SlightRight",
  "Straight",
  "Roundabout",
  "Roundabout",
  "TurnAround",
  "DestinationReached",
  "Head",
  "SlightLeft",
  "SlightRight",
];

function toPluginRoute(route: RoadRoute, waypoints: L.Routing.Waypoint[]): L.Routing.IRoute {
  return {
    name: route.steps.find((s) => s.road)?.road ?? "",
    coordinates: route.line.map(([lat, lng]) => L.latLng(lat, lng)),
    summary: { totalDistance: route.distance, totalTime: route.duration },
    // Written out by OpenRouteService, so shown as they are
    instructions: route.steps.map((s) => ({
      type: ORS_TURN[s.type] ?? "Straight",
      text: s.text,
      distance: s.distance,
      time: s.duration,
      index: s.index,
      road: s.road,
      direction: "",
    })),
    inputWaypoints: waypoints,
    waypoints,
  } as unknown as L.Routing.IRoute;
}

// The plugin's OSRM errors in the app's terms
function osrmPluginError(err: { status?: number | string; message?: string; target?: { status?: number } }): RoadError {
  const httpStatus = err.target?.status;
  if (err.status === "NoRoute" || err.status === "NoSegment")
    return new RoadError("no-route", "osrm", String(err.status));
  if (httpStatus === 429) return new RoadError("rate-limit", "osrm", err.message);
  if (err.status === -1 && (!httpStatus || /timed out/i.test(err.message ?? "")))
    return new RoadError("network", "osrm", err.message);
  return new RoadError("failed", "osrm", err.message ?? String(err.status));
}

/**
 * The plugin's router: OpenRouteService when there's a key, then the public OSRM server (through the plugin's own
 * OSRM router, whose directions it already knows how to word). Says which service was used after a fallback.
 */
function fallbackRouter(setup: RoadsSetup, onService: (service: RoadService) => void): L.Routing.IRouter {
  const osrm = L.Routing.osrmv1({ serviceUrl: OSRM_ROUTE_URL });
  // The type definitions give the callback one argument; it gets (error, routes)
  const osrmRoute = osrm.route as unknown as (
    this: L.Routing.IRouter,
    waypoints: L.Routing.Waypoint[],
    callback: (err: unknown, routes?: L.Routing.IRoute[]) => void,
    context: undefined,
    options?: L.Routing.RoutingOptions,
  ) => void;
  const viaOsrm = (waypoints: L.Routing.Waypoint[], options?: L.Routing.RoutingOptions) =>
    new Promise<L.Routing.IRoute[]>((resolve, reject) =>
      osrmRoute.call(
        osrm,
        waypoints,
        (err, routes) => (err ? reject(osrmPluginError(err as never)) : resolve(routes ?? [])),
        undefined,
        options,
      ),
    );
  return {
    route(waypoints, callback, context, options) {
      const [from, to] = waypoints.map((w) => ({ lat: w.latLng.lat, lng: w.latLng.lng }));
      withFallback(servicesFor(setup.orsKey), async (service) =>
        service === "osrm"
          ? viaOsrm(waypoints, options)
          : [toPluginRoute(await routeVia("ors", from, to, { orsKey: setup.orsKey }), waypoints)],
      ).then(
        (outcome) => {
          tellOutcome(setup, outcome, "the route");
          onService(outcome.service);
          callback.call(context, undefined, outcome.result);
        },
        (error) => {
          setup.notify(failureMessage(error, "Route"));
          callback.call(context, { status: -1, message: String(error) });
        },
      );
    },
  };
}

/**
 * Draws a driving route from the searched coordinate to the selected store, replacing any earlier route, and
 * reports its length and drive time (null when it's cleared or can't be found). The directions panel is moved into
 * `panelHost` (the column of map buttons), where it doesn't cover the store card.
 */
export async function showRoute(
  map: L.Map,
  from: L.LatLngTuple,
  to: L.LatLngTuple,
  panelHost: HTMLElement | null,
  setup: RoadsSetup,
  onRoute: (info: RouteInfo | null) => void,
) {
  clearRoute(map);
  const request = routeRequest;
  try {
    await loadRouting();
  } catch (error) {
    console.error("Couldn't load Leaflet Routing Machine", error);
    setup.notify("Route unavailable: the routing tools couldn't be loaded. Check your connection");
    return;
  }
  if (request !== routeRequest) return;

  let service: RoadService = servicesFor(setup.orsKey)[0];
  try {
    activeRoute = L.Routing.control({
      // No start/end flags, so the store pins stay visible
      plan: L.Routing.plan([L.latLng(from), L.latLng(to)], { createMarker: () => false }),
      router: fallbackRouter(setup, (used) => (service = used)),
      lineOptions: {
        styles: [{ color: "#38BDF8", weight: 5, opacity: 0.85 }],
        // The plugin's own defaults; its type definitions require them to be written out
        extendToWaypoints: true,
        missingRouteTolerance: 10,
      },
      // Step-by-step driving directions, folded into a button until opened (see .route-directions in index.css)
      containerClassName: "route-directions",
      collapsible: true,
      show: false,
    }).addTo(map);
    activeRoute.on("routesfound", (e: { routes: L.Routing.IRoute[] }) => {
      const summary = e.routes[0]?.summary;
      if (request === routeRequest && summary)
        onRoute({ distance: summary.totalDistance, duration: summary.totalTime, service });
    });
    activeRoute.on("routingerror", () => request === routeRequest && onRoute(null));
    const panel = activeRoute.getContainer();
    if (panelHost && panel) panelHost.appendChild(panel);
  } catch (error) {
    console.error("Failed to initialize Leaflet Routing control", error);
  }
}
