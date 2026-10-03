// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorBoundary, { isLoadError } from "./ErrorBoundary";

const Fails = ({ error }: { error: Error }): never => {
  throw error;
};
const STALE = new TypeError(
  "Failed to fetch dynamically imported module: https://example.test/Test-DS-Tracker/assets/CityInsights-x.js",
);

beforeEach(() => {
  // React reports the caught error on the console as well
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a part that fails", () => {
  it("a file that couldn't be fetched (a newer version published) says to reload", () => {
    render(
      <ErrorBoundary part="This panel">
        <Fails error={STALE} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Update available");
    expect(screen.getByRole("alert").textContent).toContain("A newer version of the app has been published");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("any other error names the part and shows the error, for a bug report", () => {
    render(
      <ErrorBoundary part="This card">
        <Fails error={new Error("Cannot read properties of undefined (reading 'city')")} />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This card couldn't be shown");
    expect(alert.textContent).toContain("reading 'city'");
    expect(alert.className).toContain("app-error-part");
  });

  it("is shown again when its key changes (another tab), and the rest of the page stays", () => {
    const view = (tab: string, error?: Error) => (
      <div>
        <p>Top bar</p>
        <ErrorBoundary part="This panel" resetKey={tab}>
          {error ? <Fails error={error} /> : <p>{tab} list</p>}
        </ErrorBoundary>
      </div>
    );
    const { rerender } = render(view("insights", STALE));
    expect(screen.getByText("Top bar")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(view("stores"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("stores list")).toBeTruthy();
  });

  it("the whole app's fills the screen", () => {
    render(
      <ErrorBoundary>
        <Fails error={new Error("boom")} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").className).toContain("app-error-full");
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
  });
});

describe("isLoadError", () => {
  it("knows the browsers' wording for a module that couldn't be fetched", () => {
    expect(isLoadError(STALE)).toBe(true);
    expect(isLoadError(new TypeError("error loading dynamically imported module: x.js"))).toBe(true);
    expect(isLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isLoadError(new Error("Failed to fetch"))).toBe(false);
    expect(isLoadError("boom")).toBe(false);
  });
});
