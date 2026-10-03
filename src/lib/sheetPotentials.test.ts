import { afterEach, describe, expect, it, vi } from "vitest";
import { importPotentialsCsv, Potential, potentialColumnFields, toStatus } from "./potentials";
import {
  draftsInSheet,
  isPotentialsTable,
  loadPotentialsTab,
  POTENTIAL_SHEET_COLUMNS,
  potentialSheetRow,
  potentialSheetRows,
  potentialsTemplateCsv,
  readPotentialsTable,
  sheetIssueGroups,
  spreadsheetLink,
} from "./sheetPotentials";
import { parseDelimited } from "./importer";

const TEMPLATE = POTENTIAL_SHEET_COLUMNS.map(([h]) => h);

// A row in the template's order, from the values given by header
const row = (values: Partial<Record<string, string>>) => TEMPLATE.map((h) => values[h] ?? "");

const potential = (over: Partial<Potential> = {}): Potential => ({
  id: "POT-AB234",
  name: "Hittin corner",
  city: "Riyadh",
  district: "Hittin",
  lat: 24.7612,
  lng: 46.6021,
  status: "study",
  size: 450,
  askingRentAnnual: 540000,
  expectedOpd: 150,
  contact: "Abu Fahad",
  notes: "Corner plot",
  feasibilityLink: "https://example.com/study",
  dropReason: "",
  createdAt: new Date(2026, 8, 30, 10).toISOString(),
  updatedAt: new Date(2026, 8, 30, 10).toISOString(),
  statusChangedAt: new Date(2026, 8, 30, 10).toISOString(),
  addedBy: "Sara",
  ...over,
});

describe("the Potentials tab's columns", () => {
  it("are matched by header text, whatever the case, punctuation, unit or order", () => {
    const headers = [
      "Longitude",
      "Latitude",
      "SITE NAME",
      "Potential ID",
      "city",
      "Neighbourhood",
      "Stage",
      "Area (sqm)",
      "Asking Rent (annual SAR)",
      "Expected OPD",
      "Landlord",
      "Comments",
      "Feasibility Study",
      "Reason for dropping",
      "Created By",
      "Date Added",
    ];
    expect(potentialColumnFields(headers)).toEqual([
      "lng",
      "lat",
      "name",
      "id",
      "city",
      "district",
      "status",
      "size",
      "askingRentAnnual",
      "expectedOpd",
      "contact",
      "notes",
      "feasibilityLink",
      "dropReason",
      "addedBy",
      "createdAt",
    ]);
  });

  it("the template's own headers, one Coordinates column, and the first of two matching columns", () => {
    expect(potentialColumnFields(TEMPLATE)).toEqual(POTENTIAL_SHEET_COLUMNS.map(([, f]) => f));
    expect(potentialColumnFields(["Coordinates"])).toEqual(["coords"]);
    expect(potentialColumnFields(["Lat, Lng"])).toEqual(["coords"]);
    expect(potentialColumnFields(["Name", "name"])).toEqual(["name", null]);
    // A monthly rent isn't taken for the annual asking rent; unknown headers are left out
    expect(potentialColumnFields(["Asking Rent (SAR/month)", "Rent/m² (SAR)", "Region"])).toEqual([null, null, null]);
  });
});

describe("statuses", () => {
  it("read in any case, with Scouting and Under Study as Study", () => {
    expect(["Study", "study", "Scouting", "Under Study", "under-study", " UNDER STUDY "].map(toStatus)).toEqual(
      Array(6).fill("study"),
    );
    expect(["Approved", "APPROVED"].map(toStatus)).toEqual(["approved", "approved"]);
    expect(["Backup", "back-up", "Back up"].map(toStatus)).toEqual(["backup", "backup", "backup"]);
    expect(toStatus("dropped")).toBe("dropped");
    expect(toStatus("Pending")).toBeNull();
  });

  it("an unknown one is read as Study and reported; an empty one is Study without a report", () => {
    const t = readPotentialsTable(TEMPLATE, [
      row({ ID: "POT-1", Name: "A", City: "Riyadh", Lat: "24.7", Lng: "46.6", Status: "Pending" }),
      row({ ID: "POT-2", Name: "B", City: "Riyadh", Lat: "24.7", Lng: "46.6", Status: "" }),
      row({ ID: "POT-3", Name: "C", City: "Riyadh", Lat: "24.7", Lng: "46.6", Status: "Scouting" }),
    ]);
    expect(t.list.map((p) => p.status)).toEqual(["study", "study", "study"]);
    expect(t.issues).toEqual([
      expect.objectContaining({
        kind: "status",
        row: 2,
        id: "POT-1",
        shownId: "POT-1",
        detail: expect.stringMatching(/"Pending"/),
      }),
    ]);
  });
});

describe("reading the tab", () => {
  it("every field from its column, the header on row 1", () => {
    const t = readPotentialsTable(TEMPLATE, [
      row({
        ID: "POT-AB234",
        Name: "Hittin corner",
        City: "Riyadh",
        District: "Hittin",
        Lat: "24.7612",
        Lng: "46.6021",
        Status: "Approved",
        "Size (m²)": "450",
        "Asking Rent (SAR/yr)": "540,000",
        "Expected OPD": "150",
        Contact: "Abu Fahad",
        Notes: "Corner plot",
        "Feasibility Link": "https://example.com/study",
        "Added By": "Sara",
        "Date Added": "30 Sep 2026",
      }),
    ]);
    expect(t.issues).toEqual([]);
    const [p] = t.list;
    expect(p).toMatchObject({
      id: "POT-AB234",
      name: "Hittin corner",
      district: "Hittin",
      lat: 24.7612,
      lng: 46.6021,
      status: "approved",
      size: 450,
      askingRentAnnual: 540000,
      expectedOpd: 150,
      contact: "Abu Fahad",
      addedBy: "Sara",
    });
    expect(new Date(p.createdAt).toDateString()).toBe(new Date(2026, 8, 30).toDateString());
  });

  it("takes one Coordinates column as lat, lng", () => {
    const t = readPotentialsTable(
      ["ID", "Name", "City", "Coordinates", "Status"],
      [["POT-1", "A", "Riyadh", "24.7612, 46.6021", "Study"]],
    );
    expect(t.list[0]).toMatchObject({ lat: 24.7612, lng: 46.6021 });
  });

  it("skips empty rows; a formula error reads as an empty cell", () => {
    const t = readPotentialsTable(TEMPLATE, [
      row({}),
      row({ ID: "POT-1", Name: "A", City: "Riyadh", Lat: "24.7", Lng: "46.6", Contact: "#N/A" }),
    ]);
    expect(t.list).toHaveLength(1);
    expect(t.list[0].contact).toBe("");
    expect(t.issues).toEqual([]);
  });

  it("reports rows with missing or invalid coordinates, and leaves them off the map", () => {
    const t = readPotentialsTable(TEMPLATE, [
      row({ ID: "POT-1", Name: "No place", City: "Riyadh" }),
      row({ ID: "POT-2", Name: "Text", City: "Riyadh", Lat: "north", Lng: "46.6" }),
      row({ ID: "POT-3", Name: "Zero", City: "Riyadh", Lat: "0", Lng: "0" }),
      row({ ID: "POT-4", Name: "Out of range", City: "Riyadh", Lat: "124.7", Lng: "46.6" }),
      row({ ID: "POT-5", Name: "In Jeddah", City: "Riyadh", Lat: "21.54", Lng: "39.17" }),
      row({ ID: "POT-6", Name: "Fine", City: "Riyadh", Lat: "24.7", Lng: "46.6" }),
    ]);
    expect(t.list.map((p) => p.id)).toEqual(["POT-6"]);
    expect(t.issues.map((i) => [i.kind, i.row, i.shownId])).toEqual([
      ["location", 2, null],
      ["location", 3, null],
      ["location", 4, null],
      ["location", 5, null],
      ["location", 6, null],
    ]);
    expect(t.issues[4].detail).toMatch(/km from Riyadh/);
  });

  it("reports Dropped rows without a reason (still shown), rows without an ID or name, and repeated IDs", () => {
    const t = readPotentialsTable(TEMPLATE, [
      row({ ID: "POT-1", Name: "A", City: "Riyadh", Lat: "24.7", Lng: "46.6", Status: "Dropped" }),
      row({
        ID: "POT-2",
        Name: "B",
        City: "Riyadh",
        Lat: "24.7",
        Lng: "46.6",
        Status: "Dropped",
        "Drop Reason": "Too small",
      }),
      row({ Name: "C", City: "Riyadh", Lat: "24.7", Lng: "46.6" }),
      row({ ID: "POT-1", Name: "A again", City: "Riyadh", Lat: "24.7", Lng: "46.6" }),
      row({ ID: "POT-9", City: "Riyadh", Lat: "24.7", Lng: "46.6" }),
    ]);
    expect(t.list.map((p) => [p.id, p.name, p.status, p.dropReason])).toEqual([
      ["POT-1", "A", "dropped", ""],
      ["POT-2", "B", "dropped", "Too small"],
      ["ROW-4", "C", "study", ""],
      ["POT-9", "POT-9", "study", ""],
    ]);
    expect(t.issues.map((i) => [i.kind, i.row])).toEqual([
      ["dropReason", 2],
      ["noId", 4],
      ["duplicateId", 5],
      ["noName", 6],
    ]);
    expect(t.issues[2].detail).toBe("Same ID as row 2; only row 2 is shown.");
    const q = sheetIssueGroups(t.issues);
    expect(q.rows).toBe(4);
    expect(q.groups.map((g) => g.kind)).toEqual(["dropReason", "duplicateId", "noId", "noName"]);
  });
});

describe("a missing tab", () => {
  const TEMPLATE_HEADERS = TEMPLATE;
  const STORE_HEADERS = ["Store Name", "City", "DS Code", "Live / Not Live", "Lat", "Lng"];

  it("is told from the headers: the store tab sent in its place, or any tab without Potentials columns", () => {
    expect(isPotentialsTable(TEMPLATE_HEADERS, STORE_HEADERS)).toBe(true);
    expect(isPotentialsTable(STORE_HEADERS, STORE_HEADERS)).toBe(false);
    // Even a store tab that happens to have ID, Name, Lat and Lng is not taken when it's the one just read
    const lookalike = ["ID", "Name", "City", "Lat", "Lng", "Status"];
    expect(isPotentialsTable(lookalike, lookalike)).toBe(false);
    expect(isPotentialsTable(["Month", "Orders", "Revenue"], STORE_HEADERS)).toBe(false);
    expect(isPotentialsTable(["Name", "City"], STORE_HEADERS)).toBe(false); // nowhere to place them
    expect(isPotentialsTable(["Name", "Coordinates", "Status"], STORE_HEADERS)).toBe(true);
  });

  const gviz = (body: object) =>
    `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ version: "0.6", ...body })});`;
  const stubFetch = (text: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => text })),
    );
  afterEach(() => vi.unstubAllGlobals());

  it("loads as null when Google answers with an error or with another tab", async () => {
    stubFetch(gviz({ status: "error", errors: [{ message: "Invalid sheet" }] }));
    expect(await loadPotentialsTab("SHEET", STORE_HEADERS)).toBeNull();
    stubFetch(
      gviz({
        status: "ok",
        table: { cols: STORE_HEADERS.map((label) => ({ label })), rows: [{ c: [{ v: "S1" }] }], parsedNumHeaders: 1 },
      }),
    );
    expect(await loadPotentialsTab("SHEET", STORE_HEADERS)).toBeNull();
  });

  it("an empty tab (its header only) is found, with no Potentials", async () => {
    stubFetch(
      gviz({
        status: "ok",
        table: { cols: TEMPLATE.map(() => ({ label: "" })), rows: [{ c: TEMPLATE.map((v) => ({ v })) }] },
      }),
    );
    expect(await loadPotentialsTab("SHEET", STORE_HEADERS)).toEqual({ list: [], issues: [], headers: TEMPLATE });
    stubFetch(
      gviz({ status: "ok", table: { cols: TEMPLATE.map((label) => ({ label })), rows: [], parsedNumHeaders: 1 } }),
    );
    expect((await loadPotentialsTab("SHEET", STORE_HEADERS))?.list).toEqual([]);
  });

  it("throws when the request fails, so the last list read is kept", async () => {
    stubFetch("<html>Sign in</html>");
    await expect(loadPotentialsTab("SHEET", STORE_HEADERS)).rejects.toThrow();
  });

  it("asks Google for the Potentials tab by name", async () => {
    stubFetch(gviz({ status: "error" }));
    await loadPotentialsTab("SHEET", null);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/\/d\/SHEET\/gviz\/tq\?.*&sheet=Potentials$/);
  });
});

describe("drafts and the sheet", () => {
  it("a draft goes once a row of the tab has its ID", () => {
    const drafts = [potential({ id: "POT-1" }), potential({ id: "POT-2" }), potential({ id: "POT-3" })];
    const sheet = readPotentialsTable(TEMPLATE, [
      row({ ID: "POT-2", Name: "B", City: "Riyadh", Lat: "24.7", Lng: "46.6" }),
      row({ ID: "POT-9", Name: "Z", City: "Riyadh", Lat: "24.7", Lng: "46.6" }),
      // A row that can't be read yet (no coordinates) doesn't take the draft's place
      row({ ID: "POT-3", Name: "C", City: "Riyadh" }),
    ]);
    expect(draftsInSheet(drafts, sheet.list).map((p) => p.id)).toEqual(["POT-2"]);
    expect(draftsInSheet(drafts, [])).toEqual([]);
  });

  it("a copied row is tab-separated in the template's column order", () => {
    const cells = potentialSheetRow(potential({ notes: "Corner\tplot\nnear the mosque" }), null).split("\t");
    expect(cells).toEqual([
      "POT-AB234",
      "Hittin corner",
      "Riyadh",
      "Hittin",
      "24.761200",
      "46.602100",
      "Study",
      "450",
      "540000",
      "150",
      "Abu Fahad",
      "Corner plot near the mosque",
      "https://example.com/study",
      "",
      "Sara",
      "2026-09-30",
    ]);
  });

  it("follows the tab's own columns once it's been read, blank under any other", () => {
    const headers = ["Status", "Name", "Coordinates", "Region", "ID"];
    expect(potentialSheetRow(potential({ status: "dropped", dropReason: "Too small" }), headers).split("\t")).toEqual([
      "Dropped",
      "Hittin corner",
      "24.761200, 46.602100",
      "",
      "POT-AB234",
    ]);
  });

  it("reads back from the tab as it was; Copy all drafts gives one row per draft", () => {
    const p = potential({ status: "approved" });
    const [back] = readPotentialsTable(TEMPLATE, [potentialSheetRow(p, null).split("\t")]).list;
    expect({ ...back, createdAt: "", updatedAt: "", statusChangedAt: "" }).toEqual({
      ...p,
      createdAt: "",
      updatedAt: "",
      statusChangedAt: "",
    });
    expect(new Date(back.createdAt).toDateString()).toBe(new Date(p.createdAt).toDateString());
    expect(potentialSheetRows([p, potential({ id: "POT-2" })], null).split("\n")).toHaveLength(2);
  });

  it("the template is the header row, and reads as a Potentials tab", () => {
    const csv = potentialsTemplateCsv();
    expect(csv.startsWith("﻿ID,Name,City,District,Lat,Lng,Status,")).toBe(true);
    const [headers, ...rest] = parseDelimited(csv.replace(/^﻿/, ""));
    expect(headers).toEqual(TEMPLATE);
    expect(rest.filter((r) => r.some(Boolean))).toEqual([]);
    expect(isPotentialsTable(headers, null)).toBe(true);
  });

  it("the Edit in sheet link opens the spreadsheet", () => {
    expect(spreadsheetLink("1AbC-_x")).toBe("https://docs.google.com/spreadsheets/d/1AbC-_x/edit");
  });

  it("a CSV import takes a Coordinates column too", () => {
    const r = importPotentialsCsv('Name,City,Coordinates,Status\nA,Riyadh,"24.7, 46.6",Under Study', []);
    expect(r.list[0]).toMatchObject({ name: "A", lat: 24.7, lng: 46.6, status: "study" });
  });
});
