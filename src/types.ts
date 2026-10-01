export interface Store {
  // Identity
  id: number;
  name: string;
  dsCode: string;
  city: string;
  country: string;
  // Contract; a duration that is only a number is years.months ("2" = 2 years, "1.6" = 1 year 6 months)
  contractDuration: string;
  startDate: string;
  endDate: string;
  live?: string;
  paid?: string;
  // Area and rent (SAR); null when the source data leaves them blank. For a contract under 12 months the sheet's
  // rent is the total for the term (contractValue); the annual, monthly and per m² figures are then worked out from
  // it, and the annual one is what the figures, benchmarks, pins and export use
  size: number | null;
  rentSARAnnual: number | null;
  rentSARMonthly: number | null;
  rentSARsqm: number | null;
  contractValue?: number | null;
  termMonths?: number | null; // the contract term, when the duration is readable
  // From the contract register (lookup formulas in the store sheet). contractTotal is SAR including 15% VAT
  contractNo?: string;
  contractStatus?: string;
  nextPayment?: string; // the next payment's date, as the other dates
  contractTotal?: number | null;
  // Service fees a year, without VAT (annualised for a contract under 12 months, as the rent); not in the rent figures
  serviceFeesAnnual?: number | null;
  region?: string;
  // Orders per day, and when it was measured (free text such as "Aug 2026", shown as it is)
  opd?: number | null;
  opdAsOf?: string;
  // Cells that held a spreadsheet error (#N/A, #REF!…), read as empty
  sheetErrors?: Array<{ column: string; value: string }>;
  // Location; locationIssue says why the store has no pin (missing or implausible coordinates)
  lat: number | null;
  lng: number | null;
  locationIssue?: string;
}

// Sidebar filters; "renew" = renewal due now or within the warning window
export type LiveFilter = "all" | "live" | "notlive";
export type PaidFilter = "all" | "paid" | "notpaid";
export type RenewalFilter = "all" | "renew" | "expired";
// Only the stores the coverage checks flag: outside every coverage zone, or inside white space
export type CoverageFilter = "outside" | "whitespace";

// "quality" is the Data Quality panel, opened from the Data issues card or the settings menu rather than a tab
export type SidebarTab = "stores" | "cities" | "insights" | "renewals" | "potentials" | "layers" | "quality";

export interface CitySummary {
  city: string;
  count: number;
  live: number;
  paid: number;
  annualRent: number; // SAR, with VAT when Settings say so
  area: number;
}

// ── Map layers: coverage zones and white space, from KML files or drawn in the app ──

/** A closed shape's [lat, lng] points, without repeating the first point at the end. */
export type Ring = [number, number][];

/** One polygon: its outer boundary, then any holes cut out of it. */
export type PolygonRings = Ring[];

export interface Zone {
  id: string;
  name: string;
  description: string; // plain text
  color: string | null; // "#rrggbb", or null to use the layer's colour
  polygons: PolygonRings[]; // usually one; several when the file groups shapes under one name
}

/** A line from a KML file. Shown on the map, but not part of the coverage checks. */
export interface MapLine {
  id: string;
  name: string;
  points: [number, number][];
}

// Coverage layers count in the coverage checks; white-space layers mark areas without coverage
export type LayerKind = "coverage" | "whitespace";

export interface ZoneLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  color: string; // "#rrggbb", for zones without their own colour
  opacity: number; // fill opacity, 0 to 1
  source: string; // the file it was imported from, or "" when made in the app
  zones: Zone[];
  lines: MapLine[];
  created: number; // time it was added, which keeps the list in order
}
