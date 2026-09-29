import { describe, expect, it } from "vitest";
import { BASE_MAP_ORDER, BASE_MAPS, chooseBaseMap, toBaseMapChoice, toggleNight } from "./baseMaps";

describe("base maps", () => {
  it("has the four maps, each with its provider's credit", () => {
    expect(BASE_MAP_ORDER).toEqual(["osm", "positron", "dark", "satellite"]);
    expect(BASE_MAPS.osm.attribution).toMatch(/OpenStreetMap/);
    expect(BASE_MAPS.positron.attribution).toMatch(/CARTO/);
    expect(BASE_MAPS.dark.attribution).toMatch(/CARTO/);
    expect(BASE_MAPS.satellite.attribution).toMatch(/Esri/);
    expect(BASE_MAPS.satellite.labels?.url).toMatch(/World_Boundaries_and_Places/);
    // Free tiles only: no keys in any address
    for (const id of BASE_MAP_ORDER) expect(BASE_MAPS[id].url).not.toMatch(/key|token/i);
  });

  it("opens on the dark map (night mode) with OpenStreetMap for the day, when nothing was saved", () => {
    expect(toBaseMapChoice({})).toEqual({ base: "dark", day: "osm" });
    expect(toBaseMapChoice({ base: "nonsense", day: 3 })).toEqual({ base: "dark", day: "osm" });
    expect(toBaseMapChoice({ base: "satellite", day: "positron" })).toEqual({ base: "satellite", day: "positron" });
    // A dark map can't be the day map
    expect(toBaseMapChoice({ base: "osm", day: "dark" })).toEqual({ base: "osm", day: "osm" });
  });

  it("remembers a light map as the day map; the night button goes between it and the dark one", () => {
    let choice = toBaseMapChoice({});
    choice = chooseBaseMap(choice, "positron");
    expect(choice).toEqual({ base: "positron", day: "positron" });
    choice = toggleNight(choice);
    expect(choice).toEqual({ base: "dark", day: "positron" });
    choice = toggleNight(choice);
    expect(choice.base).toBe("positron");
    choice = chooseBaseMap(choice, "satellite");
    expect(choice).toEqual({ base: "satellite", day: "positron" });
    expect(toggleNight(choice).base).toBe("dark");
  });
});
