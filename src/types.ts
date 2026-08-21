export interface Store {
  id: number;
  dsCode: string;
  whCode: string;
  name: string;
  country: string;
  city: string;
  rentUSDAnnual: number;
  rentUSDMonthly: number;
  size: number;
  lat: number | null;
  lng: number | null;
  rentAEDAnnual: number;
  rentAEDMonthly: number;
  rentAEDsqm: number;
  startDate: string;
  endDate: string;
  rentSARAnnual: number;
  rentSARMonthly: number;
  rentSARsqm: number;
  // status fields (optional/fallback)
  live?: string; 
  paid?: string;
}

export interface CitySummary {
  city: string;
  country: string;
  count: number;
  live: number;
  paid: number;
  annualRent: number; // In selected currency
  area: number;
}
