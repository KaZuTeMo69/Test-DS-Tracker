import { describe, expect, it, vi } from "vitest";
import { Store } from "../types";
import {
  checkOrsKey,
  KEY_CHECK_MESSAGE,
  airDistance,
  createCache,
  failureMessage,
  fallbackMessage,
  Fetcher,
  formatDrive,
  formatKm,
  googleMapsDirections,
  legsKey,
  nearestByAir,
  RoadError,
  roadLegs,
  roadRoute,
  RoadsFailed,
  servicesFor,
  withFallback,
} from "./roads";

const RIYADH = { lat: 24.7136, lng: 46.6753 };
const OLAYA = { lat: 24.6907, lng: 46.6853 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A fake network: answers each request with the first handler whose test matches the URL, and records the calls
function fakeFetch(handlers: [RegExp, (init?: RequestInit) => Response | Promise<Response>][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init });
    const handler = handlers.find(([test]) => test.test(url));
    if (!handler) throw new TypeError("Failed to fetch");
    return handler[1](init);
  };
  return { fetcher, calls };
}

const orsRouteAnswer = json({
  features: [
    {
      geometry: {
        coordinates: [
          [46.6753, 24.7136],
          [46.68, 24.7],
          [46.6853, 24.6907],
        ],
      },
      properties: {
        summary: { distance: 3456.7, duration: 420.5 },
        segments: [
          {
            steps: [
              {
                instruction: "Head south on King Fahd Road",
                distance: 3000,
                duration: 380,
                type: 11,
                name: "King Fahd Road",
                way_points: [0, 1],
              },
              {
                instruction: "Arrive at your destination",
                distance: 0,
                duration: 0,
                type: 10,
                name: "-",
                way_points: [2, 2],
              },
            ],
          },
        ],
      },
    },
  ],
});
const osrmRouteAnswer = () =>
  json({
    code: "Ok",
    routes: [
      {
        distance: 3600,
        duration: 450,
        geometry: {
          coordinates: [
            [46.6753, 24.7136],
            [46.6853, 24.6907],
          ],
        },
      },
    ],
  });

describe("servicesFor (the order services are tried in)", () => {
  it("is OpenRouteService then OSRM with a key, only OSRM without one", () => {
    expect(servicesFor("abc123")).toEqual(["ors", "osrm"]);
    expect(servicesFor("")).toEqual(["osrm"]);
    expect(servicesFor("   ")).toEqual(["osrm"]);
  });
});

describe("withFallback", () => {
  it("uses the first service that answers, and says which failed before it", async () => {
    const tried: string[] = [];
    const out = await withFallback(["ors", "osrm"], async (s) => {
      tried.push(s);
      if (s === "ors") throw new RoadError("rate-limit", "ors");
      return "from osrm";
    });
    expect(tried).toEqual(["ors", "osrm"]);
    expect(out).toMatchObject({ result: "from osrm", service: "osrm" });
    expect(out.failures.map((f) => f.kind)).toEqual(["rate-limit"]);
  });

  it("doesn't try the next one once a service has answered", async () => {
    const attempt = vi.fn(async (s: string) => s);
    const out = await withFallback(["ors", "osrm"], attempt);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ result: "ors", service: "ors", failures: [] });
  });

  it("reports every failure when none answers", async () => {
    const err = await withFallback(["ors", "osrm"], async (s) => {
      throw new RoadError(s === "ors" ? "key" : "network", s);
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RoadsFailed);
    expect((err as RoadsFailed).failures.map((f) => f.kind)).toEqual(["key", "network"]);
    expect((err as RoadsFailed).last.service).toBe("osrm");
  });

  it("stops at a request cancelled on purpose", async () => {
    const attempt = vi.fn(async () => {
      throw new DOMException("stopped", "AbortError");
    });
    await expect(withFallback(["ors", "osrm"], attempt)).rejects.toThrow("stopped");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe("roadRoute", () => {
  it("asks OpenRouteService (driving-car, key in a header, not the address) when there's a key", async () => {
    const { fetcher, calls } = fakeFetch([[/openrouteservice/, () => orsRouteAnswer]]);
    const { result, service } = await roadRoute(RIYADH, OLAYA, { orsKey: "KEY1", fetcher });
    expect(service).toBe("ors");
    expect(calls[0].url).toBe("https://api.openrouteservice.org/v2/directions/driving-car/geojson");
    expect(calls[0].url).not.toContain("KEY1");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("KEY1");
    expect(JSON.parse(String(calls[0].init?.body)).coordinates).toEqual([
      [46.6753, 24.7136],
      [46.6853, 24.6907],
    ]);
    expect(result).toMatchObject({ distance: 3456.7, duration: 420.5 });
    expect(result.line[0]).toEqual([24.7136, 46.6753]); // turned round to lat, lng
    expect(result.steps.map((s) => s.road)).toEqual(["King Fahd Road", ""]);
  });

  it("goes straight to OSRM without a key", async () => {
    const { fetcher, calls } = fakeFetch([[/project-osrm/, osrmRouteAnswer]]);
    const { result, service } = await roadRoute(RIYADH, OLAYA, { orsKey: "", fetcher });
    expect(service).toBe("osrm");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      "/route/v1/driving/46.675300,24.713600;46.685300,24.690700?overview=full&geometries=geojson",
    );
    expect(result).toMatchObject({ distance: 3600, duration: 450 });
  });

  it.each([
    [429, "rate-limit"],
    [401, "key"],
    [403, "key"],
    [404, "no-route"],
    [500, "failed"],
  ])("falls back to OSRM when OpenRouteService answers %i (%s)", async (status, kind) => {
    const { fetcher, calls } = fakeFetch([
      [/openrouteservice/, () => json({ error: { code: status === 404 ? 2010 : 0, message: "nope" } }, status)],
      [/project-osrm/, osrmRouteAnswer],
    ]);
    const out = await roadRoute(RIYADH, OLAYA, { orsKey: "KEY", fetcher });
    expect(calls.map((c) => (c.url.includes("openroute") ? "ors" : "osrm"))).toEqual(["ors", "osrm"]);
    expect(out.service).toBe("osrm");
    expect(out.failures[0].kind).toBe(kind);
  });

  it("falls back when OpenRouteService can't be reached", async () => {
    const { fetcher } = fakeFetch([[/project-osrm/, osrmRouteAnswer]]); // no answer from ORS: a network error
    const out = await roadRoute(RIYADH, OLAYA, { orsKey: "KEY", fetcher });
    expect(out.service).toBe("osrm");
    expect(out.failures[0].kind).toBe("network");
  });

  it("says there's no route when OSRM finds none either", async () => {
    const { fetcher } = fakeFetch([
      [/openrouteservice/, () => json({ error: { code: 2009, message: "Route could not be found" } }, 404)],
      [/project-osrm/, () => json({ code: "NoRoute", message: "Impossible route" })],
    ]);
    const err = await roadRoute(RIYADH, OLAYA, { orsKey: "KEY", fetcher }).catch((e) => e);
    expect(err).toBeInstanceOf(RoadsFailed);
    expect((err as RoadsFailed).failures.map((f) => [f.service, f.kind])).toEqual([
      ["ors", "no-route"],
      ["osrm", "no-route"],
    ]);
  });

  it("treats OSRM's rate limit as one", async () => {
    const { fetcher } = fakeFetch([[/project-osrm/, () => new Response("Too Many Requests", { status: 429 })]]);
    const err = await roadRoute(RIYADH, OLAYA, { fetcher }).catch((e) => e);
    expect((err as RoadsFailed).last.kind).toBe("rate-limit");
  });
});

describe("roadLegs (one request for several stores)", () => {
  const targets = [OLAYA, { lat: 24.8, lng: 46.6 }, { lat: 24.9, lng: 46.7 }];

  it("sends one OpenRouteService matrix request from the point to every store", async () => {
    const { fetcher, calls } = fakeFetch([
      [/matrix/, () => json({ distances: [[3000, null, 12000]], durations: [[300, null, 900]] })],
    ]);
    const { result, service } = await roadLegs(RIYADH, targets, { orsKey: "KEY", fetcher });
    expect(service).toBe("ors");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ sources: [0], destinations: [1, 2, 3], metrics: ["distance", "duration"] });
    expect(body.locations).toHaveLength(4);
    expect(result).toEqual([
      { distance: 3000, duration: 300 },
      { distance: null, duration: null }, // no road to it
      { distance: 12000, duration: 900 },
    ]);
  });

  it("falls back to one OSRM table request", async () => {
    const { fetcher, calls } = fakeFetch([
      [/openrouteservice/, () => json({ error: "Rate limit exceeded" }, 429)],
      [/table\/v1/, () => json({ code: "Ok", distances: [[3100, 8000, 12500]], durations: [[310, 700, 950]] })],
    ]);
    const out = await roadLegs(RIYADH, targets, { orsKey: "KEY", fetcher });
    expect(out.service).toBe("osrm");
    expect(out.failures[0].kind).toBe("rate-limit");
    expect(calls.filter((c) => c.url.includes("table"))).toHaveLength(1);
    expect(calls[1].url).toContain("?sources=0&destinations=1;2;3&annotations=distance,duration");
    expect(out.result[1]).toEqual({ distance: 8000, duration: 700 });
  });

  it("asks nothing when there are no stores", async () => {
    const { fetcher, calls } = fakeFetch([]);
    expect((await roadLegs(RIYADH, [], { fetcher })).result).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("nearestByAir (the stores worth asking about)", () => {
  const store = (id: number, lat: number | null, lng: number | null, live = "Live"): Store => ({
    id,
    name: `S${id}`,
    dsCode: "",
    city: "Riyadh",
    country: "KSA",
    contractDuration: "",
    startDate: "",
    endDate: "",
    size: null,
    rentSARAnnual: null,
    rentSARMonthly: null,
    rentSARsqm: null,
    lat,
    lng,
    live,
  });
  // Stores further and further north of the point, plus ones that don't count
  const stores = [
    store(1, 24.72, 46.6753),
    store(2, 24.75, 46.6753),
    store(3, 24.8, 46.6753),
    store(4, 24.71365, 46.6753), // nearest of all, but it's the store itself
    store(5, 24.9, 46.6753),
    store(6, 25.0, 46.6753),
    store(7, 25.5, 46.6753),
    store(8, 24.714, 46.6753, "Not Live"), // not live
    store(9, null, null), // no location
    store(10, 24.713, 46.6753, ""), // unclear status: not counted as live
  ];

  it("picks the 5 closest live stores with a location, nearest first, not the store itself", () => {
    const near = nearestByAir(RIYADH, stores, 5, 4);
    expect(near.map((n) => n.store.id)).toEqual([1, 2, 3, 5, 6]);
    expect(near[0].air).toBeCloseTo(712, -1); // 0.0064° of latitude, about 111 km a degree
    expect(near.every((n, i) => i === 0 || n.air >= near[i - 1].air)).toBe(true);
  });

  it("returns fewer when there aren't 5", () => {
    expect(nearestByAir(RIYADH, stores.slice(0, 2), 5)).toHaveLength(2);
  });

  it("measures straight-line distance on the globe", () => {
    expect(airDistance(RIYADH, RIYADH)).toBe(0);
    expect(airDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) / 1000).toBeCloseTo(111.2, 1);
    // Riyadh to Jeddah is about 845 km
    expect(airDistance(RIYADH, { lat: 21.4858, lng: 39.1925 }) / 1000).toBeCloseTo(846, -1);
  });
});

describe("createCache (road distances remembered for the visit)", () => {
  it("asks once per point and set of stores, and answers again from memory", async () => {
    const cache = createCache<number>();
    const load = vi.fn(async () => 42);
    const key = legsKey(RIYADH, [1, 2, 3]);
    expect(await cache.get(key, load)).toBe(42);
    expect(await cache.get(key, load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.has(key)).toBe(true);
  });

  it("shares a request still on its way", async () => {
    const cache = createCache<number>();
    let resolve = (_: number) => {};
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const a = cache.get("k", load);
    const b = cache.get("k", load);
    resolve(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("asks again for a different point or different stores", async () => {
    const cache = createCache<string>();
    const load = vi.fn(async () => "x");
    await cache.get(legsKey(RIYADH, [1, 2]), load);
    await cache.get(legsKey(OLAYA, [1, 2]), load);
    await cache.get(legsKey(RIYADH, [1, 3]), load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("forgets a failed request, so the next try asks again", async () => {
    const cache = createCache<number>();
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(cache.get("k", failing)).rejects.toThrow("offline");
    await Promise.resolve();
    const working = vi.fn(async () => 5);
    expect(await cache.get("k", working)).toBe(5);
    expect(working).toHaveBeenCalledTimes(1);
  });

  it("keys points to about a metre, so the same point from two places is the same key", () => {
    expect(legsKey({ lat: 24.713600001, lng: 46.6753 }, [1])).toBe(legsKey(RIYADH, [1]));
  });
});

describe("googleMapsDirections", () => {
  it("builds a driving directions link with no key", () => {
    expect(googleMapsDirections(RIYADH, OLAYA)).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=24.713600,46.675300&destination=24.690700,46.685300&travelmode=driving",
    );
  });

  it("handles southern and western coordinates", () => {
    expect(googleMapsDirections({ lat: -33.8688, lng: 151.2093 }, { lat: 40.7128, lng: -74.006 })).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=-33.868800,151.209300&destination=40.712800,-74.006000&travelmode=driving",
    );
  });
});

describe("what the user is told", () => {
  it("names the service used after a fallback, and why", () => {
    expect(fallbackMessage({ service: "osrm", failures: [new RoadError("rate-limit", "ors")] }, "the route")).toBe(
      "OpenRouteService has reached its free limit for now, so the route came from the public OSRM server",
    );
    expect(fallbackMessage({ service: "ors", failures: [] }, "the route")).toBeNull();
  });

  it("explains a failure by the last service's problem", () => {
    const failed = new RoadsFailed([new RoadError("key", "ors"), new RoadError("no-route", "osrm")]);
    expect(failureMessage(failed, "Route")).toBe(
      "Route unavailable: no road route between these points (one may be too far from a road)",
    );
    expect(failureMessage(new RoadsFailed([new RoadError("network", "osrm")]), "Road distances")).toMatch(
      /^Road distances unavailable: couldn't reach the routing service/,
    );
  });

  it("formats distances and drive times", () => {
    expect(formatKm(850)).toBe("850 m");
    expect(formatKm(12_430)).toBe("12.4 km");
    expect(formatKm(143_200)).toBe("143 km");
    expect(formatKm(1_096_400)).toBe("1,096 km");
    expect(formatDrive(30)).toBe("1 min");
    expect(formatDrive(1080)).toBe("18 min");
    expect(formatDrive(3900)).toBe("1 h 05 min");
  });
});

describe("checkOrsKey", () => {
  const answer = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("says ok when OpenRouteService answers with a route, sending the key in the header only", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return answer(200, {
        features: [{ properties: { summary: { distance: 400, duration: 60 } }, geometry: { coordinates: [] } }],
      })();
    };
    expect(await checkOrsKey("  my-key ", { fetcher })).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/openrouteservice/);
    expect(calls[0][0]).not.toMatch(/my-key/);
    expect((calls[0][1]?.headers as Record<string, string>).Authorization).toBe("my-key");
  });

  it("names a refused key, the rate limit and a network failure", async () => {
    expect(
      await checkOrsKey("bad", { fetcher: answer(403, { error: "Access to this API has been disallowed" }) }),
    ).toBe("key");
    expect(await checkOrsKey("bad", { fetcher: answer(401, {}) })).toBe("key");
    expect(await checkOrsKey("k", { fetcher: answer(429, { error: "Rate limit exceeded" }) })).toBe("rate-limit");
    expect(
      await checkOrsKey("k", {
        fetcher: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    ).toBe("network");
    // Accepted, but no road between the test points: the key is still fine
    expect(await checkOrsKey("k", { fetcher: answer(404, { error: { code: 2009 } }) })).toBe("ok");
    expect(KEY_CHECK_MESSAGE.key).toMatch(/refused/);
  });
});
