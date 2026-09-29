import { memo } from "react";
import { BarChart3, Building2, CalendarClock, ClipboardCheck, Layers, LucideIcon, Store } from "lucide-react";
import { SidebarTab } from "../types";

export interface PanelTab {
  tab: SidebarTab;
  label: string; // on the button (phones) and in its tooltip
  title: string; // at the top of the open panel
  Icon: LucideIcon;
}

// The panels, in the order of the rail
export const PANEL_TABS: PanelTab[] = [
  { tab: "stores", label: "Stores", title: "Stores", Icon: Store },
  { tab: "cities", label: "City", title: "Cities", Icon: Building2 },
  { tab: "insights", label: "Growth", title: "Growth & coverage", Icon: BarChart3 },
  { tab: "renewals", label: "Renewals", title: "Renewals", Icon: CalendarClock },
  { tab: "layers", label: "Layers", title: "Map layers", Icon: Layers },
];
// Opened from the settings menu, the Data Issues figure, and the foot of the rail
export const QUALITY_TAB: PanelTab = {
  tab: "quality",
  label: "Data quality",
  title: "Data quality",
  Icon: ClipboardCheck,
};

export const panelTab = (tab: SidebarTab) => [...PANEL_TABS, QUALITY_TAB].find((t) => t.tab === tab) ?? PANEL_TABS[0];

// A count on an icon, capped so it stays small
const Badge = ({ n, tone }: { n: number; tone: "red" | "orange" }) =>
  n > 0 ? <span className={`rail-badge ${tone}`}>{n > 99 ? "99+" : n}</span> : null;

export interface RailBadges {
  renewals: number; // renewals due now
  quality: number; // stores with data issues
}

/** One of the panels' buttons: in the rail on large screens, and in the row at the top of the phone sheet. */
export function PanelButton({
  item,
  active,
  badge,
  badgeTone = "red",
  onClick,
  withLabel = false,
}: {
  item: PanelTab;
  active: boolean;
  badge?: number;
  badgeTone?: "red" | "orange";
  onClick: () => void;
  withLabel?: boolean;
}) {
  const { Icon } = item;
  return (
    <button
      data-tab={item.tab}
      onClick={onClick}
      aria-pressed={active}
      aria-label={withLabel ? undefined : item.label}
      data-tip={withLabel ? undefined : item.label}
      className={`rail-btn ${active ? "on" : ""} ${withLabel ? "with-label" : ""}`}
    >
      <span className="rail-icon">
        <Icon size={withLabel ? 18 : 19} strokeWidth={active ? 2.3 : 1.9} />
        {badge !== undefined && <Badge n={badge} tone={badgeTone} />}
      </span>
      {withLabel && <span className="rail-label">{item.label}</span>}
    </button>
  );
}

/** The column of panel icons down the left of the map (large screens). The open panel's icon is lit. */
const NavRail = memo(function NavRail({
  currentTab,
  open,
  badges,
  onSelect,
}: {
  currentTab: SidebarTab;
  open: boolean;
  badges: RailBadges;
  onSelect: (tab: SidebarTab) => void;
}) {
  return (
    <nav
      className="nav-rail flex flex-col items-center shrink-0 bg-[#0d0d0d] border-r border-[#222]"
      aria-label="Panels"
    >
      {PANEL_TABS.map((item) => (
        <PanelButton
          key={item.tab}
          item={item}
          active={open && currentTab === item.tab}
          badge={item.tab === "renewals" ? badges.renewals : undefined}
          onClick={() => onSelect(item.tab)}
        />
      ))}
      <div className="flex-1" />
      <PanelButton
        item={QUALITY_TAB}
        active={open && currentTab === "quality"}
        badge={badges.quality}
        badgeTone="orange"
        onClick={() => onSelect("quality")}
      />
    </nav>
  );
});

export default NavRail;
