export interface Store {
  id: number;
  dsCode: string;
  whCode: string;
  name: string;
  country: string;
  city: string;
  // Rent and area are null when the source data leaves them blank
  rentUSDAnnual: number | null;
  rentUSDMonthly: number | null;
  size: number | null;
  lat: number | null;
  lng: number | null;
  rentAEDAnnual: number | null;
  rentAEDMonthly: number | null;
  rentAEDsqm: number | null;
  startDate: string;
  endDate: string;
  rentSARAnnual: number | null;
  rentSARMonthly: number | null;
  rentSARsqm: number | null;
  // status fields (optional/fallback)
  live?: string; 
  paid?: string;
  // Why the store has no pin on the map (missing or implausible coordinates)
  locationIssue?: string;
}

export interface CitySummary {
  city: string;
  count: number;
  live: number;
  paid: number;
  annualRent: number; // In selected currency
  area: number;
}
