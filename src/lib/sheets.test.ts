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

describe("a sheet that isn't shared publicly", () => {
  it("Google's sign-in page in place of the data says to share the sheet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer("<!DOCTYPE html><html><title>Sign in - Google Accounts</title></html>")),
    );
    await expect(fetchSheetTable("SHEET")).rejects.toThrow(
      "Google didn't send the sheet's data. Check that the sheet is shared as “Anyone with the link can view”.",
    );
  });

  it("an answer the browser won't read (a redirect to sign in) or a dropped connection says the same", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchSheetTable("SHEET")).rejects.toThrow(
      /^Couldn't reach the Google Sheet\. Check your connection\. Check that the sheet is shared as/,
    );
  });
});
