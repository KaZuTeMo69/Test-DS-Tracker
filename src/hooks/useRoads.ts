import { createContext, useContext, useMemo } from "react";
import { Store } from "../types";
import { LatLng } from "../lib/coords";
import {
  createCache,
  failureMessage,
  Fallback,
  fallbackMessage,
  isAbort,
  legsKey,
  nearestByAir,
  RoadLeg,
  roadLegs,
  RoadRoute,
  roadRoute,
  RoadService,
} from "../lib/roads";

/** The OpenRouteService key from Settings, and how to tell the user what happened. Provided by the App. */
export interface RoadsSetup {
  orsKey: string;
  notify: (message: string) => void;
}

export const RoadsContext = createContext<RoadsSetup>({ orsKey: "", notify: () => {} });

// Without a key, say once per visit where routes come from and how to get better ones
let toldAboutKey = false;
function mentionKey({ orsKey, notify }: RoadsSetup, service: RoadService) {
  if (orsKey || toldAboutKey || service !== "osrm") return;
  toldAboutKey = true;
  notify(
    "Routes come from the free public OSRM server. For more reliable ones, add a free OpenRouteService key in Settings",
  );
}

/** After a request: say which service answered when it wasn't the first choice, or why none could. */
export function tellOutcome(setup: RoadsSetup, outcome: Pick<Fallback<unknown>, "service" | "failures">, what: string) {
  const message = fallbackMessage(outcome, what);
  if (message) setup.notify(message);
  else mentionKey(setup, outcome.service);
}

export interface NearbyRow {
  store: Store;
  air: number; // m, straight line
  road: RoadLeg | null; // null until known, or when the request failed
}

export interface Nearby {
  rows: NearbyRow[];
  service: RoadService | null;
}

// Road distances to the nearest stores, per point and set of stores, for as long as the page is open
const legsCache = createCache<Fallback<RoadLeg[]>>();

/** For tests: forget remembered road distances. */
export const clearRoadCache = () => legsCache.clear();

/** Sorted by road distance (stores with no road route last), straight-line distance breaking ties. */
export function byRoad(rows: NearbyRow[]): NearbyRow[] {
  const key = (r: NearbyRow) => r.road?.distance ?? Infinity;
  return [...rows].sort((a, b) => key(a) - key(b) || a.air - b.air);
}

/** Routes and road distances, with fallback between services, remembered answers, and toasts for what happened. */
export function useRoads() {
  const setup = useContext(RoadsContext);
  return useMemo(() => {
    const { orsKey, notify } = setup;
    return {
      orsKey,
      notify,

      /** The driving route between two points; null (after a toast) when no service could give one. */
      async route(
        from: LatLng,
        to: LatLng,
        label: string,
        signal?: AbortSignal,
      ): Promise<(RoadRoute & { service: RoadService }) | null> {
        try {
          const outcome = await roadRoute(from, to, { orsKey, signal });
          tellOutcome(setup, outcome, `the ${label.toLowerCase()}`);
          return { ...outcome.result, service: outcome.service };
        } catch (e) {
          if (isAbort(e)) throw e;
          notify(failureMessage(e, label));
          return null;
        }
      },

      /** The nearest live stores to a point (straight line), then their road distances in one request. */
      nearest(point: LatLng, stores: Store[], excludeId?: number) {
        const near = nearestByAir(point, stores, 5, excludeId);
        const key = legsKey(
          point,
          near.map((n) => n.store.id),
        );
        const cached = legsCache.has(key);
        const load = legsCache.get(key, () =>
          roadLegs(
            point,
            near.map((n) => ({ lat: n.store.lat!, lng: n.store.lng! })),
            { orsKey },
          ),
        );
        const answer: Promise<Nearby> = load.then(
          (outcome) => {
            // Told once, when the answer first comes, not every time it's read from memory
            if (!cached && near.length) tellOutcome(setup, outcome, "the road distances");
            return {
              rows: byRoad(near.map((n, i) => ({ ...n, road: outcome.result[i] ?? null }))),
              service: outcome.service,
            };
          },
          (e) => {
            notify(failureMessage(e, "Road distances"));
            return { rows: near.map((n) => ({ ...n, road: null })), service: null };
          },
        );
        return { near, cached, answer };
      },
    };
  }, [setup]);
}
