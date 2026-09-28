export interface Store {
  // Identity
  id: number;
  name: string;
  dsCode: string;
  city: string;
  country: string;
  // Contract; a duration that is only a number is in years ("2" = 2 years)
  contractDuration: string;
  startDate: string;
  endDate: string;
  live?: string;
  paid?: string;
  // Area and rent (SAR); null when the source data leaves them blank
  size: number | null;
  rentSARAnnual: number | null;
  rentSARMonthly: number | null;
  rentSARsqm: number | null;
  // Location; locationIssue says why the store has no pin (missing or implausible coordinates)
  lat: number | null;
  lng: number | null;
  locationIssue?: string;
}

// Renewal filter in the sidebar: "renew" = renewal due now or within the warning window
export type RenewalFilter = "all" | "renew" | "expired";

export interface CitySummary {
  city: string;
  count: number;
  live: number;
  paid: number;
  annualRent: number; // SAR
  area: number;
}
