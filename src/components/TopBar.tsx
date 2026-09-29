import { memo, ReactNode, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  FileEdit,
  Menu,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Store as StoreIcon,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CURRENCY } from "../constants";
import { useSettings } from "../hooks/useSettings";
import { fmtN } from "../lib/format";
import { KpiStats, missing } from "../lib/kpis";
import { ExtraFigures } from "./KpiFigures";
import { Bone } from "./Skeleton";

const BADGE_TONE = {
  green: { pill: "bg-green-500/10 border-green-500/25 text-green-400", dot: "bg-green-400" },
  red: { pill: "bg-red-500/10 border-red-500/30 text-red-400", dot: "bg-red-400" },
  grey: { pill: "bg-white/5 border-white/15 text-gray-300", dot: "bg-gray-400" },
};

/** Where the data on screen comes from, and whether it's current. */
function SourceBadge({
  sheetId,
  lastSync,
  syncError,
  fileName,
}: {
  sheetId: string;
  lastSync: string;
  syncError: string | null;
  fileName: string | null;
}) {
  let tone: keyof typeof BADGE_TONE = "grey";
  let label = "Sample data";
  let detail = "";
  let title = "Sample stores for trying the app. Use Upload to load your own.";
  if (sheetId && syncError) {
    tone = "red";
    label = "Sync failed";
    detail = lastSync ? `data from ${lastSync}` : "no data loaded";
    title = `Google Sheet sync failed: ${syncError}${lastSync ? `. Showing the data from ${lastSync}.` : ""}`;
  } else if (sheetId && !lastSync) {
    label = "Connecting";
    title = "Loading your Google Sheet";
  } else if (sheetId) {
    tone = "green";
    label = "Synced";
    detail = lastSync;
    title = `Google Sheet synced at ${lastSync}. It refreshes every 5 minutes.`;
  } else if (fileName) {
    label = "Local file";
    detail = fileName;
    title = `Data from ${fileName}. It doesn't update by itself; import it again to refresh.`;
  }

  return (
    <div
      className={`source-badge flex items-center gap-2 min-w-0 border rounded-full text-[11px] font-bold uppercase tracking-widest whitespace-nowrap ${BADGE_TONE[tone].pill}`}
      title={title}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${BADGE_TONE[tone].dot} ${label === "Connecting" ? "animate-pulse" : ""}`}
      />
      <span className="max-xl:sr-only">{label}</span>
      {detail && (
        <span className="hidden min-[1400px]:inline font-mono font-normal normal-case tracking-normal truncate max-w-[140px]">
          · {detail}
        </span>
      )}
    </div>
  );
}

// One figure in the top bar: the value, and a small label (and note) beside it
function Kpi({
  id,
  value,
  label,
  note,
  color,
  noteColor = "text-gray-400",
  title,
  active,
  onClick,
  loading,
}: {
  id: string;
  value: ReactNode;
  label: string;
  note?: string;
  color: string;
  noteColor?: string;
  title?: string;
  active?: boolean;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      data-kpi={id}
      onClick={onClick}
      title={title}
      className={`kpi-card kpi-inline flex items-center shrink-0 rounded-md ${active ? "on" : ""}`}
    >
      <span className="kpi-number" style={{ color }}>
        {loading ? <Bone w={34} h={18} className="kpi-bone" /> : value}
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="kpi-label">{label}</span>
        {note && !loading && <span className={`kpi-note max-md:hidden ${noteColor}`}>{note}</span>}
      </span>
    </button>
  );
}

interface TopBarProps {
  // Where the data comes from
  sheetId: string;
  lastSync: string;
  syncError: string | null;
  fileName: string | null;
  isSyncing: boolean;
  onUpload: () => void;
  onSync: () => void;
  onResetSample: () => void;
  onOpenSettings: () => void;
  onOpenDataQuality: () => void;
  // The figures, for the stores that pass the filters
  stats: KpiStats;
  unclear: { total: number; live: number; paid: number }; // across all stores
  unclearOnly: boolean;
  onShowUnclear: () => void;
  issueCount: number; // across all stores
  onShowIssues: () => void;
  loading: boolean; // a saved Google Sheet is loading: placeholders instead of zeros
  // The coordinate search on the map
  searchOpen: boolean;
  onToggleSearch: () => void;
}

/**
 * The one bar at the top: the app and where its data comes from; the main figures in a row (they scroll
 * sideways on small screens), with the rest in a popover; and the actions as icon buttons.
 */
const TopBar = memo(function TopBar(props: TopBarProps) {
  const { stats, unclear, unclearOnly, onShowUnclear, issueCount, onShowIssues, loading } = props;
  const { leadDays, warningDays, includeVat } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // The popover closes with Esc or a click anywhere else
  useEffect(() => {
    if (!moreOpen) return;
    // Esc closes just the popover, not the panel as well
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMoreOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !(t as HTMLElement).closest?.("[data-kpi]")) setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [moreOpen]);

  const toggleMore = () => setMoreOpen((o) => !o);
  const pct = stats.total ? `${Math.round((stats.live / stats.total) * 100)}%` : undefined;
  // The bar says how many start soon; how many have already expired is in the tooltip (and the Renewals panel)
  const renewNote = stats.renewals.soon ? `+${stats.renewals.soon} in ${warningDays}d` : undefined;
  const renewTitle = [
    `Renewal window (the last ${leadDays} days of the contract) has started`,
    stats.renewals.soon && `+${stats.renewals.soon} more start in the next ${warningDays} days`,
    stats.renewals.expired && `${stats.renewals.expired} expired (the contract has ended)`,
  ]
    .filter(Boolean)
    .join("\n");
  const rentNote = [`${CURRENCY} / yr${includeVat ? " incl. VAT" : ""}`, missing(stats.noRent, "rent")]
    .filter(Boolean)
    .join(" · ");

  const iconBtn =
    "topbar-btn flex items-center justify-center h-9 min-w-9 rounded-lg border border-[#333] bg-[#1a1a1a] text-[#d4d4d4] hover:border-[#fbbf24] hover:text-[#fbbf24] transition-colors cursor-pointer";

  return (
    <header className="topbar app-header relative flex flex-wrap md:flex-nowrap items-center shrink-0 bg-[#0d0d0d] border-b border-[#222] z-[1500]">
      <div className="topbar-brand order-1 flex items-center gap-2.5 min-w-0">
        <div className="max-[399px]:hidden w-8 h-8 shrink-0 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/25 flex items-center justify-center text-[#fbbf24]">
          <StoreIcon size={17} />
        </div>
        <span className="logo-text font-['Oswald'] italic font-bold uppercase whitespace-nowrap text-[#fbbf24]">
          <span className="hidden min-[1400px]:inline">Dark Store Tracker</span>
          <span className="min-[1400px]:hidden">DS Tracker</span>
        </span>
        <SourceBadge
          sheetId={props.sheetId}
          lastSync={props.lastSync}
          syncError={props.syncError}
          fileName={props.fileName}
        />
      </div>

      <div
        className="topbar-kpis order-3 md:order-2 w-full md:w-auto md:flex-1 min-w-0 flex items-center overflow-x-auto"
        aria-label="Totals"
      >
        <Kpi
          id="total"
          value={stats.total}
          label="Total"
          color="#ffffff"
          onClick={toggleMore}
          active={moreOpen}
          loading={loading}
          title="Stores that match the filters. Click for more figures"
        />
        <Kpi
          id="live"
          value={stats.live}
          label="Live"
          note={pct}
          color="#22C55E"
          onClick={toggleMore}
          loading={loading}
        />
        <Kpi
          id="notlive"
          value={stats.total - stats.live}
          label="Not live"
          color="#F43F5E"
          onClick={toggleMore}
          loading={loading}
        />
        <Kpi
          id="unpaid"
          value={stats.total - stats.paid}
          label="Unpaid"
          color="#FECC00"
          onClick={toggleMore}
          loading={loading}
        />
        <Kpi
          id="renewals"
          value={stats.renewals.now}
          label="Renew now"
          note={renewNote}
          noteColor="text-[#FB923C]"
          color="#F43F5E"
          onClick={toggleMore}
          loading={loading}
          title={renewTitle}
        />
        <Kpi
          id="rent"
          value={stats.totalRent > 0 ? fmtN(stats.totalRent) : "—"}
          label="Annual rent"
          note={rentNote}
          color="#ffffff"
          onClick={toggleMore}
          loading={loading}
        />
        {!loading && unclear.total > 0 && (
          <Kpi
            id="unclear"
            value={unclear.total}
            label="⚠\u00a0Unclear status"
            note={unclearOnly ? "Showing these" : "View stores"}
            noteColor="text-[#FB923C]"
            color="#FB923C"
            active={unclearOnly}
            onClick={onShowUnclear}
            loading={false}
            title={[
              unclear.live && `${unclear.live} with a blank or unrecognised Live status (counted as Not Live)`,
              unclear.paid && `${unclear.paid} with a blank or unrecognised Payment status (counted as Unpaid)`,
              "Click to list them",
            ]
              .filter(Boolean)
              .join("\n")}
          />
        )}
        {!loading && issueCount > 0 && (
          <Kpi
            id="issues"
            value={issueCount}
            label="Data issues"
            note="View by problem"
            noteColor="text-[#FB923C]"
            color="#FB923C"
            onClick={onShowIssues}
            loading={false}
            title="Stores with missing or unreadable data, grouped by problem"
          />
        )}
        <button
          onClick={toggleMore}
          className={`topbar-more shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-[#fbbf24] ${moreOpen ? "text-[#fbbf24]" : ""}`}
          title="Monthly rent, total area and average rent per m²"
          aria-expanded={moreOpen}
          aria-label="More figures"
        >
          <ChevronDown size={16} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {moreOpen && (
        <div
          ref={moreRef}
          className="kpi-popover absolute bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
          role="dialog"
          aria-label="More figures"
        >
          <ExtraFigures stats={stats} />
        </div>
      )}

      <div className="topbar-actions order-2 md:order-3 ml-auto flex items-center gap-2 shrink-0">
        <button
          onClick={props.onToggleSearch}
          className={`${iconBtn} ${props.searchOpen ? "!border-[#fbbf24] !text-[#fbbf24]" : ""}`}
          title="Search coordinates"
          aria-pressed={props.searchOpen}
        >
          <Search size={16} />
        </button>
        <button
          onClick={props.onUpload}
          className="topbar-upload max-sm:!hidden flex items-center gap-1.5 h-9 px-2.5 2xl:px-3 bg-[#fbbf24] hover:bg-[#ffe169] text-black rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer"
          title="Upload CSV/JSON file or sync Google Sheet"
          aria-label="Upload data"
        >
          <Upload size={15} />
          <span className="hidden 2xl:inline">Upload</span>
        </button>
        {props.sheetId && (
          <button onClick={props.onSync} className={iconBtn} title="Sync from Google Sheet">
            <RefreshCw size={15} className={props.isSyncing ? "animate-spin text-[#fbbf24]" : ""} />
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`${iconBtn} ${menuOpen ? "!border-[#fbbf24] !text-[#fbbf24]" : ""}`}
            title="Settings"
            aria-expanded={menuOpen}
          >
            {/* On a phone it's the menu: Upload lives in it there, to leave the row to the app and its status */}
            <Settings size={16} className="max-sm:hidden" />
            <Menu size={18} className="sm:hidden" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-52 bg-[#111111] border border-[#262626] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[101] overflow-hidden"
                >
                  <div className="p-1.5 flex flex-col gap-1">
                    {(
                      [
                        [SlidersHorizontal, "Settings", props.onOpenSettings],
                        [ClipboardCheck, "Data quality", props.onOpenDataQuality],
                        [FileEdit, "Import / Upload", props.onUpload],
                        [RefreshCw, "Reset Sample Data", props.onResetSample],
                      ] as const
                    ).map(([Icon, text, action]) => (
                      <button
                        key={text}
                        onClick={() => {
                          action();
                          setMenuOpen(false);
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-[11px] font-black uppercase text-gray-300 hover:text-[#fbbf24] hover:bg-white/5 rounded-lg transition-all text-left"
                      >
                        <Icon size={14} />
                        <span>{text}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
});

export default TopBar;
