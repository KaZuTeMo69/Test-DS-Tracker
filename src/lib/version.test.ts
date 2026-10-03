import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_COMMIT, APP_VERSION, builtOn, versionLine } from "./version";

describe("the app's version", () => {
  it("is package.json's, with the commit it was built from", () => {
    const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(APP_VERSION).toBe(version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_COMMIT).toMatch(/^([0-9a-f]{7}|local)$/);
    expect(versionLine()).toBe(`Version ${version} · build ${APP_COMMIT}`);
  });

  it("writes the build's day as the app writes dates", () => {
    expect(builtOn("2026-10-03")).toBe("03 Oct 2026");
    expect(builtOn("soon")).toBe("soon");
    expect(builtOn()).toMatch(/^\d\d [A-Z][a-z]{2} \d{4}$/);
  });
});
