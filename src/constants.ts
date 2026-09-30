// All rent figures are in Saudi riyals
export const CURRENCY = "SAR";

export const PIN_SEL = "#38BDF8";

// List tag and colours for the renewal statuses that need attention
export const RENEWAL_STYLE: Record<"soon" | "now" | "expired", { tag: string; className: string }> = {
  soon: { tag: "RENEW SOON", className: "bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]" },
  now: { tag: "RENEW NOW", className: "bg-red-500/10 border-red-500/30 text-red-400" },
  expired: { tag: "EXPIRED", className: "bg-red-500/20 border-red-500/50 text-red-300" },
};

// Tags for the stores the coverage checks flag: in the store card, and shorter in the list so names keep their room
export const COVERAGE_TAG: Record<"outside" | "whitespace", { tag: string; short: string; className: string }> = {
  outside: {
    tag: "NO COVERAGE ZONE",
    short: "NO COVERAGE",
    className: "bg-[#A78BFA]/10 border-[#A78BFA]/35 text-[#C4B5FD]",
  },
  whitespace: { tag: "IN WHITE SPACE", short: "WHITE SPACE", className: "bg-white/10 border-white/25 text-gray-100" },
};

// Tags for a store whose next payment (from the contract register) is due within 30 days, or past due
export const PAYMENT_TAG: Record<"due" | "overdue", { tag: string; className: string }> = {
  due: { tag: "PAYMENT DUE", className: "bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]" },
  overdue: { tag: "PAYMENT OVERDUE", className: "bg-red-500/15 border-red-500/45 text-red-300" },
};

// Tag for a store whose rent per m² is more than the Settings % above its city median
export const HIGH_RENT_TAG = { tag: "HIGH RENT", className: "bg-red-500/10 border-red-500/35 text-red-300" };
