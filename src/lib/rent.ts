/**
 * The rent column read with the contract term. For a contract of 12 months or more it's the annual rent, as its
 * header says. For a shorter one it's the total for the term (a 6-month contract's rent is the 6-month amount), so
 * the annual and monthly figures are worked out from it, and so is rent per m² (the sheet's rent per m² column is
 * then ignored). With an unknown term the rent is taken as annual.
 */
export interface RentFigures {
  annual: number | null; // annualised for short contracts; used everywhere (figures, benchmarks, pins, export)
  monthly: number | null;
  perSqm: number | null;
  contractValue: number | null; // the total for the term, for contracts under 12 months; otherwise null
  termMonths: number | null; // the term, when it's known
}

export function rentFigures(
  rentColumn: number | null,
  termMonths: number | null,
  size: number | null,
  sheetPerSqm: number | null,
): RentFigures {
  const short = rentColumn !== null && termMonths !== null && termMonths > 0 && termMonths < 12;
  if (short) {
    const annual = (rentColumn * 12) / termMonths;
    return {
      annual,
      monthly: rentColumn / termMonths,
      perSqm: size ? annual / size : null,
      contractValue: rentColumn,
      termMonths,
    };
  }
  return {
    annual: rentColumn,
    monthly: rentColumn === null ? null : rentColumn / 12,
    perSqm: sheetPerSqm ?? (rentColumn !== null && size ? rentColumn / size : null),
    contractValue: null,
    termMonths,
  };
}

/** The rent column as it is in the sheet: the term's total for a short contract, else the annual rent. */
export const sheetRent = (s: { contractValue?: number | null; rentSARAnnual: number | null }) =>
  s.contractValue ?? s.rentSARAnnual;
