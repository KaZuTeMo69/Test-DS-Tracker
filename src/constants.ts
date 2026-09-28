// All rent figures are in Saudi riyals
export const CURRENCY = "SAR";

export const PIN_SEL = "#38BDF8";

// List tag and colours for the renewal statuses that need attention
export const RENEWAL_STYLE: Record<"soon" | "now" | "expired", { tag: string; className: string }> = {
  soon: { tag: "RENEW SOON", className: "bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]" },
  now: { tag: "RENEW NOW", className: "bg-red-500/10 border-red-500/30 text-red-400" },
  expired: { tag: "EXPIRED", className: "bg-red-500/20 border-red-500/50 text-red-300" },
};
