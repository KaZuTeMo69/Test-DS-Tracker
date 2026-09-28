import L from "leaflet";

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

/**
 * Draws a driving route from the searched coordinate to the selected store, replacing any earlier route.
 * The directions panel is moved into `panelHost` (the column of map buttons), where it doesn't cover the store card.
 */
export async function showRoute(map: L.Map, from: L.LatLngTuple, to: L.LatLngTuple, panelHost: HTMLElement | null) {
  clearRoute(map);
  const request = routeRequest;
  try {
    await loadRouting();
  } catch (error) {
    console.error("Couldn't load Leaflet Routing Machine", error);
    return;
  }
  if (request !== routeRequest) return;

  try {
    activeRoute = L.Routing.control({
      // No start/end flags, so the store pins stay visible
      plan: L.Routing.plan([L.latLng(from), L.latLng(to)], { createMarker: () => false }),
      // Public OSRM demo server: free, no key, but meant for light use
      router: L.Routing.osrmv1({ serviceUrl: "https://router.project-osrm.org/route/v1" }),
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
    const panel = activeRoute.getContainer();
    if (panelHost && panel) panelHost.appendChild(panel);
  } catch (error) {
    console.error("Failed to initialize Leaflet Routing control", error);
  }
}
