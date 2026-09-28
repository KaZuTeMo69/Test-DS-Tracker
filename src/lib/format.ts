const UNITS: Array<[number, string]> = [
  [1e3, "K"],
  [1e6, "M"],
  [1e9, "B"],
];

export function fmtN(n: number): string {
  if (Math.round(Math.abs(n)) < 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  // The unit is chosen after rounding, so 999,999 shows as 1.00M rather than 1000K
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i];
    const v = n / size;
    const digits = suffix === "M" ? 2 : Math.abs(v) < 100 ? 1 : 0;
    const text = v.toFixed(digits);
    if (Math.abs(parseFloat(text)) < 1000 || i === UNITS.length - 1) {
      return (suffix === "M" ? text : text.replace(/\.0$/, "")) + suffix;
    }
  }
  return String(n);
}

export function fmtR(n: number | null): string {
  return n === null ? "—" : fmtN(n);
}
