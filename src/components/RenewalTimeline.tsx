import { memo, useCallback, useMemo, useState } from "react";
import { Store } from "../types";
import { useSettings } from "../hooks/useSettings";
import { formatDate, pluralDays, RenewalInfo, today } from "../lib/contract";
import { renewalTimeline, TIMELINE_MONTHS, TimelineRow } from "../lib/timeline";
import LoadMore from "./LoadMore";

interface RenewalTimelineProps {
  stores: Store[]; // the stores that pass the filters
  totalStores: number;
  selectedId: number | null;
  onSelectStore: (id: number) => void;
}

const ROW_BATCH = 100;

type ShownStatus = "now" | "soon" | "ok";
const STATUS_TEXT: Record<ShownStatus, string> = { now: "Renew now", soon: "Renew soon", ok: "Later" };

// A position across the chart, in the rows and the header: the label column, then the months
const across = (percent: number) => `calc(var(--tl-label) + (100% - var(--tl-label)) * ${percent / 100})`;

const Row = memo(function Row({
  row,
  selected,
  onSelect,
}: {
  row: TimelineRow;
  selected: boolean;
  onSelect: (id: number) => void;
  key?: number;
}) {
  const { store, info, contractFrom, renewalFrom, endAt, endsLater } = row;
  const status = info.status as ShownStatus;
  const end = formatDate(info.endDate!);
  const title = [
    store.name,
    `Contract ends ${end}`,
    `Renewal ${info.daysToRenewal! <= 0 ? "started" : "starts"} ${formatDate(info.renewalStart!)}`,
    STATUS_TEXT[status],
  ].join(" · ");
  return (
    <button
      onClick={() => onSelect(store.id)}
      className={`timeline-row ${selected ? "on" : ""}`}
      title={title}
      aria-label={title}
    >
      <span className="timeline-label">
        <span className="timeline-name">{store.name}</span>
        <span className="timeline-sub">
          {end} · {store.dsCode || store.city || "—"}
        </span>
      </span>
      <span className="timeline-track">
        <i className="timeline-contract" style={{ left: `${contractFrom}%`, width: `${endAt - contractFrom}%` }} />
        <i
          className={`timeline-window ${status}`}
          style={{ left: `${renewalFrom}%`, width: `max(3px, ${endAt - renewalFrom}%)` }}
        />
        {endsLater ? <i className="timeline-more">›</i> : <i className="timeline-end" style={{ left: `${endAt}%` }} />}
      </span>
    </button>
  );
});

function ExpiredList({
  expired,
  onSelect,
}: {
  expired: Array<{ store: Store; info: RenewalInfo }>;
  onSelect: (id: number) => void;
}) {
  const [shown, setShown] = useState(ROW_BATCH);
  return (
    <details className="timeline-expired">
      <summary className="text-[11.5px] font-bold text-red-400 cursor-pointer">
        Expired contracts ({expired.length})
      </summary>
      <div className="flex flex-col layer-zone-list">
        {expired.slice(0, shown).map(({ store, info }) => (
          <button
            key={store.id}
            onClick={() => onSelect(store.id)}
            className="layer-zone flex items-center gap-2 text-left text-[12px] rounded-md"
          >
            <span className="truncate font-bold">{store.name}</span>
            <span className="text-[10.5px] text-gray-400 ml-auto shrink-0">
              ended {formatDate(info.endDate!)} · {pluralDays(-info.daysToEnd!)} ago
            </span>
          </button>
        ))}
        {expired.length > shown && (
          <button onClick={() => setShown((n) => n + ROW_BATCH)} className="layer-zone text-[11px] text-gray-400">
            Show more
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * The next 12 months of renewals as a chart: one row per contract whose renewal starts in that time, with the
 * contract (grey), its renewal window (coloured by status) and its end. Clicking a row selects the store.
 */
export default function RenewalTimeline({ stores, totalStores, selectedId, onSelectStore }: RenewalTimelineProps) {
  const { leadDays, warningDays } = useSettings();
  const day = today().getTime();
  const timeline = useMemo(
    () => renewalTimeline(stores, { leadDays, warningDays }, new Date(day)),
    [stores, leadDays, warningDays, day],
  );
  const [shown, setShown] = useState(ROW_BATCH);
  const showMore = useCallback(() => setShown((n) => n + ROW_BATCH), []);
  const { rows, months, todayAt, expired, noEndDate } = timeline;
  const count = (status: ShownStatus) => rows.filter((r) => r.info.status === status).length;

  return (
    <div className="timeline flex flex-col">
      <div className="text-[12px] text-gray-200 leading-relaxed">
        <b>{rows.length}</b> {rows.length === 1 ? "renewal starts" : "renewals start"} in the next {TIMELINE_MONTHS}{" "}
        months: <span className="text-red-400 font-bold">{count("now")} now</span> ·{" "}
        <span className="text-[#fbbf24] font-bold">{count("soon")} soon</span> · {count("ok")} later
      </div>
      {stores.length < totalStores && (
        <div className="text-[11px] text-gray-400">
          Showing the {stores.length} of {totalStores} stores that match the filters in the Stores tab.
        </div>
      )}

      <div className="timeline-legend flex flex-wrap items-center text-[10.5px] text-gray-400">
        <span>
          <i className="timeline-key contract" /> Contract
        </span>
        <span>
          <i className="timeline-key window now" /> Renew now
        </span>
        <span>
          <i className="timeline-key window soon" /> Renew soon
        </span>
        <span>
          <i className="timeline-key window ok" /> Renewal later
        </span>
        <span>
          <i className="timeline-key end" /> Ends
        </span>
        <span className="text-[#38BDF8]">| Today</span>
      </div>

      {expired.length > 0 && <ExpiredList expired={expired} onSelect={onSelectStore} />}

      {rows.length === 0 ? (
        <div className="text-center text-[12px] text-gray-500 timeline-empty">
          No renewal starts in the next {TIMELINE_MONTHS} months.
        </div>
      ) : (
        <div className="timeline-chart">
          <div className="timeline-head">
            {months.map((m) => (
              <span key={m.at} className="timeline-month" style={{ left: across(m.at) }}>
                <span className="timeline-long">{m.label}</span>
                <span className="timeline-short">{m.label[0]}</span>
                {m.year && (
                  <span className="timeline-year">
                    <span className="timeline-long">{m.year}</span>
                    <span className="timeline-short">’{String(m.year).slice(2)}</span>
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="timeline-body">
            {months.slice(1).map((m) => (
              <i key={m.at} className="timeline-gridline" style={{ left: across(m.at) }} />
            ))}
            <i className="timeline-today" style={{ left: across(todayAt) }} />
            {rows.slice(0, shown).map((row) => (
              <Row key={row.store.id} row={row} selected={row.store.id === selectedId} onSelect={onSelectStore} />
            ))}
          </div>
          {rows.length > shown && <LoadMore key={shown} onVisible={showMore} text="Loading more renewals…" />}
        </div>
      )}

      <div className="text-[10.5px] text-gray-500 leading-relaxed">
        Renewal starts {pluralDays(leadDays)} before the contract ends and shows as Renew soon {pluralDays(warningDays)}{" "}
        before that (change these in Settings).
        {noEndDate > 0 &&
          ` ${noEndDate} ${noEndDate === 1 ? "store has" : "stores have"} no readable contract end date and ${noEndDate === 1 ? "isn't" : "aren't"} shown.`}
      </div>
    </div>
  );
}
