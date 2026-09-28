import { describe, expect, it } from "vitest";
import { parseCoordinateInput } from "./coords";

const point = (input: string) => {
  const result = parseCoordinateInput(input);
  return result && "point" in result ? result.point : result;
};

describe("parseCoordinateInput", () => {
  it("reads decimal coordinates with a comma or a space", () => {
    expect(point("24.7136, 46.6753")).toEqual({ lat: 24.7136, lng: 46.6753 });
    expect(point("24.7136 46.6753")).toEqual({ lat: 24.7136, lng: 46.6753 });
    expect(point("  -33.9,18.4 ")).toEqual({ lat: -33.9, lng: 18.4 });
  });

  it("reads degrees, minutes and seconds", () => {
    const p = point(`27°33'15.5"N 41°42'18.1"E`) as { lat: number; lng: number };
    expect(p.lat).toBeCloseTo(27 + 33 / 60 + 15.5 / 3600, 6);
    expect(p.lng).toBeCloseTo(41 + 42 / 60 + 18.1 / 3600, 6);
  });

  it("uses the hemisphere letters, in either order", () => {
    const p = point(`46°40'E 24°42'N`) as { lat: number; lng: number };
    expect(p.lat).toBeCloseTo(24.7, 6);
    expect(p.lng).toBeCloseTo(46 + 40 / 60, 6);
    expect((point(`33°54'S 18°25'E`) as { lat: number }).lat).toBeLessThan(0);
  });

  it("returns nothing for an empty box", () => {
    expect(parseCoordinateInput("   ")).toBeNull();
  });

  it.each(["91, 46", "24, 181", "foo, bar"])("explains why %j is invalid", (input) => {
    expect(parseCoordinateInput(input)).toEqual({ error: expect.stringContaining("Invalid coordinates") });
  });

  it("asks for two numbers", () => {
    expect(parseCoordinateInput("24.7")).toEqual({ error: "Please enter coordinates as Lat, Lng (or DMS)." });
  });

  it("explains a malformed DMS value", () => {
    expect(parseCoordinateInput(`24°42'N`)).toEqual({ error: expect.stringContaining("Invalid DMS format") });
  });
});
