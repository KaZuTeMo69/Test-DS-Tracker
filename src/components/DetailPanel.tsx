import { memo, ReactNode, useState } from "react";
import { X } from "lucide-react";
import { Store } from "../types";
import { COVERAGE_TAG, CURRENCY, RENEWAL_STYLE } from "../constants";
import { contractDateIssues, dataIssues, hasCoords } from "../lib/checks";
import { Coverage, coverageFlags, ZoneHit } from "../lib/coverage";
import { daysBetween, formatDate, formatDuration, parseDate, pluralDays, RenewalInfo, today } from "../lib/contract";
import { fmtN } from "../lib/format";
import { storeRenewal } from "../lib/renewal";
import { RentComparison, rentComparison } from "../lib/rentStats";
import { isLive, isPaid, liveStatus, paidStatus } from "../lib/status";

interface DetailPanelProps {
  store: Store | null;
  stores: Store[]; // all stores, for the rent comparisons
  coverage: Coverage;
  onSelectZone: (layerId: string, zoneId: string) => void;
  onClose: () => void;
  onRemove?: () => void; // only for manually added stores
}

type Tab = "summary" | "rent" | "contract";
type Tone = "good" | "warn" | "bad";

// Class names are written out in full so Tailwind generates them
const TONE: Record<Tone, { box: string; text: string; bold: string; row: string; dot: string; mark: string }> = {
  good: {
    box: "border-green-500/30 bg-green-500/10",
    text: "text-green-400",
    bold: "[&_b]:text-green-400",
    row: "!text-green-400",
    dot: "bg-green-500/15 text-green-400",
    mark: "✓",
  },
  warn: {
    box: "border-[#fbbf24]/35 bg-[#fbbf24]/10",
    text: "text-[#fbbf24]",
    bold: "[&_b]:text-[#fbbf24]",
    row: "!text-[#fbbf24]",
    dot: "bg-[#fbbf24]/15 text-[#fbbf24]",
    mark: "!",
  },
  bad: {
    box: "border-red-500/40 bg-red-500/10",
    text: "text-red-400",
    bold: "[&_b]:text-red-400",
    row: "!text-red-400",
    dot: "bg-red-500/15 text-red-400",
    mark: "!",
  },
};

const worst = (...tones: Tone[]): Tone => (tones.includes("bad") ? "bad" : tones.includes("warn") ? "warn" : "good");

const renewalTone = ({ status }: RenewalInfo): Tone =>
  status === "expired" || status === "now" ? "bad" : status === "ok" ? "good" : "warn";

// Exact figures in the card; the rounded 274K style is for the tiles and totals
const sar = (n: number | null) =>
  n === null ? "—" : `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const endsIn = (days: number) => (days === 0 ? "today" : `in ${pluralDays(days)}`);

const ordinal = (n: number) => {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10];
  return `${n}${suffix || "th"}`;
};

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// "3" or "3 Years" → "3-year", "6 Months" → "6-month"; anything else as written
function termPhrase(term: string): string {
  const m = formatDuration(term).match(/^(\d+(?:\.\d+)?)\s*(year|month)s?$/i);
  return m ? `${m[1]}-${m[2].toLowerCase()}` : term.trim().toLowerCase();
}

// ── Small building blocks ──

function Tile({
  label,
  value,
  unit,
  note,
  noteClass = "text-gray-400",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  noteClass?: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg store-card-box min-w-0">
      <div className="detail-panel-row-label text-[9px]">{label}</div>
      <div className="detail-panel-figure text-[20px] leading-tight store-card-gap-top">
        {value}
        {unit && <span className="text-[11px] text-gray-400 font-semibold store-card-unit">{unit}</span>}
      </div>
      {note && <div className={`text-[10px] store-card-gap-top ${noteClass}`}>{note}</div>}
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 store-card-row items-baseline">
      <span className="detail-panel-row-label text-[10px] shrink-0">{label}</span>
      <span className={`detail-panel-row-value text-[12.5px] text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="detail-panel-row-label text-[9.5px] text-gray-500 store-card-section">{children}</div>
);

// A check that didn't pass: a coloured mark and a line of text
function Problem({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className="flex gap-2 items-start text-[11.5px] text-gray-200 leading-snug">
      <span className={`w-4 h-4 shrink-0 rounded-full grid place-items-center text-[9px] font-black ${TONE[tone].dot}`}>
        {TONE[tone].mark}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function DaysLeftTile({ renewal, term }: { renewal: RenewalInfo; term: string }) {
  const { daysToEnd } = renewal;
  if (daysToEnd === null) return <Tile label="Days left" value="—" note="No contract end date" />;
  if (daysToEnd < 0)
    return <Tile label="Days left" value="Ended" note={`${pluralDays(-daysToEnd)} ago`} noteClass="text-red-400" />;
  return <Tile label="Days left" value={daysToEnd} note={term.trim() ? `of a ${termPhrase(term)} term` : undefined} />;
}

// ── Summary tab ──

function situation(store: Store, r: RenewalInfo): { tone: Tone; text: ReactNode } {
  const live = isLive(store);
  const paid = isPaid(store);
  const trading =
    live && paid
      ? "Live and paid."
      : live
        ? "Live, but the rent is unpaid."
        : paid
          ? "Not live, rent paid."
          : "Not live and unpaid.";
  const end = r.endDate ? formatDate(r.endDate) : "";
  const start = r.renewalStart ? formatDate(r.renewalStart) : "";

  let contract: ReactNode = "The contract end date is unknown.";
  if (r.status === "expired") {
    contract = (
      <>
        The contract <b>ended on {end}</b>, {pluralDays(-r.daysToEnd!)} ago.
      </>
    );
  } else if (r.status === "now") {
    contract = (
      <>
        The contract ends <b>{endsIn(r.daysToEnd!)}</b> ({end}).{" "}
        {r.daysToRenewal === 0 ? (
          <b>Renewal starts today.</b>
        ) : (
          <>
            <b>Renewal is {pluralDays(-r.daysToRenewal!)} overdue</b> (it should have started on {start}).
          </>
        )}
      </>
    );
  } else if (r.status === "soon") {
    contract = (
      <>
        The contract ends <b>{endsIn(r.daysToEnd!)}</b> ({end}). <b>Start renewal by {start}</b>,{" "}
        {endsIn(r.daysToRenewal!)}.
      </>
    );
  } else if (r.status === "ok") {
    contract = `The contract ends on ${end}, ${endsIn(r.daysToEnd!)}. Renewal starts on ${start}.`;
  }
  return {
    tone: worst(renewalTone(r), live && paid ? "good" : "warn"),
    text: (
      <>
        {trading} {contract}
      </>
    ),
  };
}

// One checklist line for the Live or Paid status, including why a blank or unknown value counts as "no"
function statusCheck(value: boolean | null, raw: string | undefined, yes: string, no: string, what: string) {
  const text = raw?.trim();
  if (value) return { tone: "good" as Tone, text: yes };
  if (value === false) return { tone: "warn" as Tone, text: `${no} (status: ${text})` };
  return {
    tone: "warn" as Tone,
    text: text ? `${no}: ${what} "${text}" isn't recognised` : `${no}: the ${what} is blank`,
  };
}

function SummaryTab({
  store,
  renewal,
  rent,
  coverage,
  onSelectZone,
}: {
  store: Store;
  renewal: RenewalInfo;
  rent: RentComparison;
  coverage: Coverage;
  onSelectZone: (layerId: string, zoneId: string) => void;
}) {
  const { tone, text } = situation(store, renewal);
  const cityName = store.city || "city";

  let rateNote: string | undefined;
  let rateNoteClass = "text-gray-400";
  if (rent.vsCity !== null && rent.cityRateCount >= 2) {
    rateNote =
      rent.vsCity === 0
        ? `Same as ${cityName} avg`
        : `${Math.abs(rent.vsCity)}% ${rent.vsCity > 0 ? "above" : "below"} ${cityName} avg`;
    rateNoteClass = rent.vsCity > 0 ? "text-[#fbbf24]" : "text-green-400";
  }

  const checks: Array<{ tone: Tone; text: string }> = [
    statusCheck(liveStatus(store), store.live, "Live", "Not live", "live status"),
    statusCheck(paidStatus(store), store.paid, "Rent paid", "Unpaid", "payment status"),
  ];
  const { status, daysToRenewal, daysToEnd } = renewal;
  if (status === "ok" || status === "soon") {
    checks.push({ tone: renewalTone(renewal), text: `Renewal ${endsIn(daysToRenewal!)}` });
  } else if (status === "now") {
    checks.push({
      tone: "bad",
      text: daysToRenewal === 0 ? "Renewal starts today" : `Renewal is ${pluralDays(-daysToRenewal!)} overdue`,
    });
  } else if (status === "expired") {
    checks.push({ tone: "bad", text: `Contract expired ${pluralDays(-daysToEnd!)} ago` });
  } else {
    checks.push({ tone: "warn", text: "No contract end date" });
  }
  checks.push(
    hasCoords(store)
      ? { tone: "good", text: "On the map" }
      : { tone: "warn", text: `${store.locationIssue || "No coordinates"}. Not on the map.` },
  );
  const issues = dataIssues(store, { location: false, status: false });
  if (issues.length === 0) checks.push({ tone: "good", text: "No missing data" });
  issues.forEach((issue) => checks.push({ tone: "warn", text: issue }));

  return (
    <>
      <div className={`rounded-lg border store-card-box text-[12px] leading-relaxed text-gray-100 ${TONE[tone].box}`}>
        <span className={`[&_b]:font-bold ${TONE[tone].bold}`}>{text}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Annual rent"
          value={store.rentSARAnnual === null ? "—" : fmtN(store.rentSARAnnual)}
          unit={store.rentSARAnnual === null ? undefined : CURRENCY}
        />
        <Tile label="Area" value={store.size || "—"} unit={store.size ? "m²" : undefined} />
        <Tile
          label="Rent / m²"
          value={rent.storeRate === null ? "—" : Math.round(rent.storeRate).toLocaleString()}
          unit={rent.storeRate === null ? undefined : CURRENCY}
          note={rateNote}
          noteClass={rateNoteClass}
        />
        <DaysLeftTile renewal={renewal} term={store.contractDuration} />
      </div>

      <SectionLabel>Status check</SectionLabel>
      {/* Problems get a line each; checks that pass are a compact row of pills */}
      <div className="flex flex-col gap-1">
        {checks
          .filter((check) => check.tone !== "good")
          .map((check, i) => (
            <Problem key={i} tone={check.tone}>
              {check.text}
            </Problem>
          ))}
        <div className="flex flex-wrap gap-1">
          {checks
            .filter((check) => check.tone === "good")
            .map((check, i) => (
              <span
                key={i}
                className="store-card-chip rounded-full border border-green-500/25 bg-green-500/10 text-green-400 text-[10.5px] font-semibold"
              >
                ✓ {check.text}
              </span>
            ))}
        </div>
      </div>

      <CoverageSection store={store} coverage={coverage} onSelectZone={onSelectZone} />
    </>
  );
}

// The coverage and white-space zones the store is in; each opens that zone's card
function ZoneLink({ hit, onSelect }: { hit: ZoneHit; onSelect: (layerId: string, zoneId: string) => void }) {
  return (
    <button
      onClick={() => onSelect(hit.layerId, hit.zoneId)}
      className="store-card-zone flex items-center gap-2 w-full text-left rounded-md"
      title="Open this zone"
    >
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: hit.color }} />
      <span className="text-[12px] font-bold text-white truncate">{hit.zoneName}</span>
      <span className="text-[10.5px] text-gray-400 truncate ml-auto shrink-0 max-w-[45%]">{hit.layerName}</span>
    </button>
  );
}

function CoverageSection({
  store,
  coverage,
  onSelectZone,
}: {
  store: Store;
  coverage: Coverage;
  onSelectZone: (layerId: string, zoneId: string) => void;
}) {
  if (!coverage.hasCoverage && !coverage.hasWhiteSpace) return null;
  const zones = coverage.zonesOf.get(store.id) ?? [];
  const whiteSpace = coverage.whiteSpaceOf.get(store.id) ?? [];
  const { outside } = coverageFlags(coverage, store);
  return (
    <>
      <SectionLabel>Coverage</SectionLabel>
      {!hasCoords(store) ? (
        <div className="text-[11.5px] text-gray-400">Not checked, as the store has no location.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {outside && <Problem tone="warn">Not in any coverage zone on the map</Problem>}
          {whiteSpace.length > 0 && (
            <Problem tone="warn">Inside white space, an area marked as having no coverage</Problem>
          )}
          {[...zones, ...whiteSpace].map((hit) => (
            <ZoneLink key={hit.zoneId} hit={hit} onSelect={onSelectZone} />
          ))}
          {!outside && !zones.length && !whiteSpace.length && (
            <div className="text-[11.5px] text-gray-400">Not in any white-space zone.</div>
          )}
        </div>
      )}
    </>
  );
}

// ── Rent tab ──

function rentSentences(store: Store, rent: RentComparison): string {
  const city = store.city || "this city";
  const compare = (diff: number, what: string) =>
    diff === 0 ? `the same as ${what}` : `${Math.abs(diff)}% ${diff > 0 ? "above" : "below"} ${what}`;
  const vs = [
    rent.vsCity !== null && rent.cityRateCount >= 2 ? compare(rent.vsCity, `the ${city} average`) : "",
    rent.vsPortfolio !== null ? compare(rent.vsPortfolio, "all stores") : "",
  ].filter(Boolean);

  let rank = "";
  if (rent.cityRentRank !== null && rent.cityRentCount >= 2) {
    const n = rent.cityRentCount;
    const position =
      rent.cityRentRank === 1
        ? "highest"
        : rent.cityRentRank === n
          ? "lowest"
          : `${ordinal(rent.cityRentRank)} highest`;
    rank = `the ${position} rent of the ${n} ${city} stores`;
  }
  const share = rent.shareOfTotalRent !== null ? `${rent.shareOfTotalRent}% of total annual rent` : "";

  const first = vs.length ? `${capitalise(vs.join(" and "))}.` : "";
  const second =
    rank && share ? `${capitalise(rank)}, and ${share}.` : rank || share ? `${capitalise(rank || share)}.` : "";
  return [first, second].filter(Boolean).join(" ");
}

function RentTab({ store, rent }: { store: Store; rent: RentComparison }) {
  const bars = [
    { label: "This store", value: rent.storeRate, mine: true },
    ...(rent.cityRateCount >= 2 ? [{ label: `${store.city} avg`, value: rent.cityRate, mine: false }] : []),
    { label: "All stores", value: rent.portfolioRate, mine: false },
  ].filter((b): b is { label: string; value: number; mine: boolean } => b.value !== null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  const paid = isPaid(store);

  return (
    <>
      <div className="flex justify-between items-end gap-3 bg-white/[0.03] border border-white/10 rounded-lg store-card-box">
        <div className="min-w-0">
          <div className="detail-panel-row-label text-[9px]">Annual rent</div>
          <div className="detail-panel-figure text-[25px] leading-tight text-[#f3e008]">{sar(store.rentSARAnnual)}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="detail-panel-row-label text-[9px]">Monthly</div>
          <div className="detail-panel-figure text-[15px] store-card-gap-top">{sar(store.rentSARMonthly)}</div>
        </div>
      </div>

      <div>
        <Row label="Rent per m²" value={sar(store.rentSARsqm)} />
        <Row label="Area" value={store.size ? `${store.size} m²` : "—"} />
        <Row
          label="Payment"
          value={paid ? "Paid" : "Unpaid"}
          valueClass={paid ? "!text-green-400" : "!text-orange-400"}
        />
      </div>

      <SectionLabel>Rent per m² compared</SectionLabel>
      {rent.storeRate === null ? (
        <div className="text-[11.5px] text-gray-400">Rent per m² needs both the annual rent and the area.</div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {bars.map((bar) => (
              <div key={bar.label} className="grid grid-cols-[92px_1fr_62px] gap-2 items-center text-[11.5px]">
                <span className={`truncate ${bar.mine ? "font-bold text-white" : "text-gray-300"}`}>{bar.label}</span>
                <div className="h-[9px] bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${bar.mine ? "bg-[#f3e008]" : "bg-[#555]"}`}
                    style={{ width: `${(bar.value / max) * 100}%` }}
                  />
                </div>
                <span className={`text-right ${bar.mine ? "font-bold text-[#f3e008]" : "text-gray-400"}`}>
                  {CURRENCY} {Math.round(bar.value).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[11.5px] text-gray-400 leading-relaxed">{rentSentences(store, rent)}</div>
        </>
      )}
    </>
  );
}

// ── Contract tab ──

const STATUS_LABEL: Record<RenewalInfo["status"], string> = {
  ok: "On track",
  soon: "Renew soon",
  now: "Renew now",
  expired: "Expired",
  unknown: "Unknown",
};

function Timeline({ start, renewal }: { start: Date; renewal: RenewalInfo }) {
  const end = renewal.endDate!;
  const termDays = daysBetween(start, end) + 1;
  const at = (d: Date) => Math.min(100, Math.max(0, (daysBetween(start, d) / termDays) * 100));
  const now = today();
  const todayPct = at(now);
  const windowPct = at(renewal.renewalStart!);
  const label =
    daysBetween(start, now) < 0
      ? "TODAY · not started"
      : todayPct >= 100
        ? "TODAY · ended"
        : `TODAY · ${Math.round(todayPct)}% through`;
  const labelOnLeft = todayPct > 55;

  return (
    <div>
      <div className="relative store-card-timeline">
        <div
          className={`absolute -top-6 text-[10px] font-extrabold text-[#38BDF8] whitespace-nowrap ${labelOnLeft ? "-translate-x-full store-card-label-left" : "store-card-label-right"}`}
          style={{ left: `${todayPct}%` }}
        >
          {label}
        </div>
        <div
          className="absolute -top-2 w-0.5 h-[26px] bg-[#38BDF8] -translate-x-1/2 z-10"
          style={{ left: `${todayPct}%` }}
        />
        <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#3a3a3a] to-[#6b6b6b]"
            style={{ width: `${todayPct}%` }}
          />
          <div className="absolute inset-y-0 right-0 bg-[#fbbf24]/60" style={{ left: `${windowPct}%` }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-gray-400 store-card-gap-top">
          <span>{formatDate(start)}</span>
          <span>{formatDate(end)}</span>
        </div>
      </div>
      <div className="flex gap-3 text-[10.5px] text-gray-400 store-card-legend">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-[#6b6b6b]" /> Time passed
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm bg-[#fbbf24]/70" /> Renewal window (last 75 days)
        </span>
      </div>
    </div>
  );
}

function ContractTab({ store, renewal }: { store: Store; renewal: RenewalInfo }) {
  const start = parseDate(store.startDate);
  const { status, renewalStart, daysToRenewal } = renewal;
  const toneRow = TONE[renewalTone(renewal)].row;
  const renewalValue =
    renewalStart && daysToRenewal !== null
      ? `${formatDate(renewalStart)} · ${daysToRenewal < 0 ? `${pluralDays(-daysToRenewal)} ago` : endsIn(daysToRenewal)}`
      : "—";

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Term" value={formatDuration(store.contractDuration) || "—"} />
        <DaysLeftTile renewal={renewal} term="" />
      </div>

      {start && renewal.endDate && renewal.endDate > start ? (
        <Timeline start={start} renewal={renewal} />
      ) : (
        <div
          className={`rounded-lg border store-card-box text-[11.5px] leading-relaxed ${TONE.warn.box} ${TONE.warn.text}`}
        >
          {(contractDateIssues(store).length ? contractDateIssues(store) : ["No contract end date."]).map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      <div>
        <Row label="Start" value={store.startDate || "—"} />
        <Row label="End" value={store.endDate || "—"} />
        <Row label="Renewal starts" value={renewalValue} valueClass={status === "ok" ? "" : toneRow} />
        <Row label="Status" value={STATUS_LABEL[status]} valueClass={toneRow} />
      </div>
    </>
  );
}

// ── The card ──

const TABS: Array<[Tab, string]> = [
  ["summary", "Summary"],
  ["rent", "Rent"],
  ["contract", "Contract"],
];

// z-[600]: above the map legend (500), below the sidebar (2000) and toasts (999)
function StoreCard({
  store,
  stores,
  coverage,
  onSelectZone,
  onClose,
  onRemove,
}: DetailPanelProps & { store: Store; key?: number }) {
  const [tab, setTab] = useState<Tab>("summary");
  // Removing takes a second click, so a stray tap can't delete a store
  const [confirmRemove, setConfirmRemove] = useState(false);
  const renewal = storeRenewal(store);
  const rent = rentComparison(store, stores);
  const renewalTag = renewal.status === "soon" || renewal.status === "now" || renewal.status === "expired";
  const flags = coverageFlags(coverage, store);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-[12px] right-[52px] max-h-[calc(100%-32px)] w-[360px] max-w-[calc(100%-64px)] bg-[#111111]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col z-[600]"
    >
      <div className="store-card-header border-b border-[#262626]">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="detail-panel-title text-[18px] text-white leading-tight truncate">{store.name}</h3>
            <p className="detail-panel-subtext text-[11px] store-card-gap-top">
              {store.dsCode || "No DS code"} · {store.city || "No city"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 store-card-chips">
          <span
            className={`detail-panel-tag-live text-[10px] store-card-chip rounded-full border ${isLive(store) ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}
          >
            {isLive(store) ? "LIVE" : "NOT LIVE"}
          </span>
          <span
            className={`detail-panel-tag-paid text-[10px] store-card-chip rounded-full border ${isPaid(store) ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-orange-500/10 text-orange-400 border-orange-500/30"}`}
          >
            {isPaid(store) ? "PAID" : "UNPAID"}
          </span>
          {renewalTag && (
            <span
              className={`detail-panel-tag-live text-[10px] store-card-chip rounded-full border ${RENEWAL_STYLE[renewal.status as "soon" | "now" | "expired"].className}`}
            >
              {RENEWAL_STYLE[renewal.status as "soon" | "now" | "expired"].tag}
            </span>
          )}
          {flags.outside && (
            <span
              className={`detail-panel-tag-live text-[10px] store-card-chip rounded-full border ${COVERAGE_TAG.outside.className}`}
            >
              {COVERAGE_TAG.outside.tag}
            </span>
          )}
          {flags.inWhiteSpace && (
            <span
              className={`detail-panel-tag-live text-[10px] store-card-chip rounded-full border ${COVERAGE_TAG.whitespace.className}`}
            >
              {COVERAGE_TAG.whitespace.tag}
            </span>
          )}
        </div>
      </div>

      <div className="tab-container store-card-tabs">
        {TABS.map(([id, text]) => (
          <button key={id} className={`tab-btn ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
            {text}
          </button>
        ))}
      </div>

      <div className="store-card-body flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-0">
        {tab === "summary" && (
          <SummaryTab store={store} renewal={renewal} rent={rent} coverage={coverage} onSelectZone={onSelectZone} />
        )}
        {tab === "rent" && <RentTab store={store} rent={rent} />}
        {tab === "contract" && <ContractTab store={store} renewal={renewal} />}
      </div>

      <div className="store-card-footer">
        {hasCoords(store) ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="detail-panel-maps-btn text-[12px] block w-full store-card-button bg-[#fbbf24] text-black font-extrabold text-center rounded-lg transition-transform active:scale-95 no-underline shadow-lg"
          >
            📍 Open in Google Maps
          </a>
        ) : (
          <button
            disabled
            className="detail-panel-maps-btn text-[12px] block w-full store-card-button bg-[#1a1a1a] text-gray-600 font-extrabold text-center rounded-lg cursor-not-allowed border border-[#333]"
          >
            No Maps link
          </button>
        )}
        {onRemove && (
          <button
            onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
            className={`text-[11px] block w-full store-card-gap-top font-bold text-center rounded-lg cursor-pointer transition-colors store-card-button border ${confirmRemove ? "bg-red-500/15 border-red-500/40 text-red-300" : "bg-transparent border-[#333] text-red-400 hover:border-red-500/40"}`}
          >
            {confirmRemove ? "Click again to remove this store" : "Remove manual store"}
          </button>
        )}
      </div>
    </div>
  );
}

// A fresh card per store, so it always opens on the Summary tab
const DetailPanel = memo(function DetailPanel({ store, ...props }: DetailPanelProps) {
  if (!store) return null;
  return <StoreCard key={store.id} store={store} {...props} />;
});

export default DetailPanel;
