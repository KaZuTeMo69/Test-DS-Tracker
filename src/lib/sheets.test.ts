import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSheetTable, SHEET_TIMEOUT_MS } from "./sheets";

// Google's gviz answer around a table
const gviz = (body: object) =>
  `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ version: "0.6", status: "ok", ...body })});`;

const answer = (text: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => text });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("asking Google for a sheet tab", () => {
  it("gives up after the timeout, so the next sync can try again", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
          ),
      ),
    );
    const loading = fetchSheetTable("SHEET", "All Countries");
    const outcome = expect(loading).rejects.toThrow(`didn't answer within ${SHEET_TIMEOUT_MS / 1000} seconds`);
    await vi.advanceTimersByTimeAsync(SHEET_TIMEOUT_MS);
    await outcome;
  });

  it("an error status is a failure, not a page to read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer("<html>Not found</html>", 404)),
    );
    await expect(fetchSheetTable("SHEET")).rejects.toThrow("Google Sheets answered with an error (404)");
  });

  it("reads a good answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        answer(gviz({ table: { cols: [{ label: "Store Name" }], rows: [{ c: [{ v: "A" }] }], parsedNumHeaders: 1 } })),
      ),
    );
    expect(await fetchSheetTable("SHEET")).toEqual({ headers: ["Store Name"], rows: [["A"]] });
  });
});
