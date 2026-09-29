import { describe, expect, it } from "vitest";
import { DEFAULT_URL_STATE, parseUrlState, urlStateToSearch } from "./urlState";

describe("urlState", () => {
  it("is empty for the default view", () => {
    expect(urlStateToSearch(DEFAULT_URL_STATE)).toBe("");
    expect(parseUrlState("")).toEqual(DEFAULT_URL_STATE);
  });

  it("round-trips a view", () => {
    const view = {
      tab: "renewals" as const,
      q: "hub & co",
      live: "live" as const,
      paid: "notpaid" as const,
      renewal: "renew" as const,
      city: "Al Khobar",
      only: "outside" as const,
      store: "DS-101",
    };
    const search = urlStateToSearch(view);
    expect(search).toBe(
      "?tab=renewals&q=hub+%26+co&live=live&paid=notpaid&renewal=renew&city=Al+Khobar&only=outside&store=DS-101",
    );
    expect(parseUrlState(search)).toEqual(view);
  });

  it("ignores values it doesn't know, and anything else in the link", () => {
    expect(parseUrlState("?tab=admin&live=maybe&only=everything&sheet=1AbC&data=x")).toEqual(DEFAULT_URL_STATE);
  });

  it("never writes anything but the view", () => {
    const search = urlStateToSearch(parseUrlState("?sheet=1AbCdEf&id=2&tab=layers"));
    expect(search).toBe("?tab=layers");
  });

  it("limits the length of free text", () => {
    const long = "x".repeat(500);
    const s = parseUrlState(`?q=${long}&city=${long}&store=${long}`);
    expect([s.q.length, s.city.length, s.store?.length]).toEqual([200, 100, 50]);
  });
});
