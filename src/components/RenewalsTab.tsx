import { memo, useMemo, useState } from "react";
import { Store } from "../types";
import { formatDate, pluralDays, today } from "../lib/contract";
import { PAYMENT_WARNING_DAYS, paymentInfo, PaymentStatus } from "../lib/payments";
import RenewalTimeline from "./RenewalTimeline";

interface Props {
  stores: Store[]; // the stores that pass the filters
  totalStores: number;
  selectedId: number | null;
  onSelectStore: (id: number) => void;
}

type View = "renewals" | "payments";

interface PaymentRow {
  store: Store;
  status: PaymentStatus;
  date: Date;
  days: number;
}

const PaymentItem = memo(function PaymentItem({
  row,
  selected,
  onSelect,
}: {
  row: PaymentRow;
  selected: boolean;
  onSelect: (id: number) => void;
  key?: number;
}) {
  const { store, status, date, days } = row;
  return (
    <button
      className={`payment-row ${status} ${selected ? "on" : ""}`}
      onClick={() => onSelect(store.id)}
      data-payment={status}
    >
      <span className="payment-name">{store.name}</span>
      <span className="payment-date">{formatDate(date)}</span>
      <span className="payment-sub">
        {store.dsCode || "No DS code"} · {store.city}
        {store.contractNo ? ` · ${store.contractNo}` : ""}
      </span>
      <span className="payment-when">
        {days < 0 ? `${pluralDays(-days)} overdue` : days === 0 ? "today" : `in ${pluralDays(days)}`}
      </span>
    </button>
  );
});

/**
 * The next payments from the contract register ("Next Payment"): overdue ones first, then those due within
 * PAYMENT_WARNING_DAYS, then the rest of the next year. A row selects the store.
 */
function PaymentsList({ stores, totalStores, selectedId, onSelectStore }: Props) {
  const day = today().getTime();
  const { rows, withoutDate } = useMemo(() => {
    const on = new Date(day);
    const list: PaymentRow[] = [];
    let without = 0;
    for (const store of stores) {
      const p = paymentInfo(store, on);
      if (p.status === "none" || !p.date || p.days === null) {
        without++;
        continue;
      }
      if (p.days > 366) continue;
      list.push({ store, status: p.status, date: p.date, days: p.days });
    }
    list.sort((a, b) => a.days - b.days);
    return { rows: list, withoutDate: without };
  }, [stores, day]);
  const overdue = rows.filter((r) => r.status === "overdue");
  const due = rows.filter((r) => r.status === "due");
  const later = rows.filter((r) => r.status === "later");

  const group = (title: string, list: PaymentRow[], tone: string) =>
    list.length > 0 && (
      <section className="payments-group">
        <h4 className={`payments-group-title ${tone}`}>
          {title} · {list.length}
        </h4>
        {list.map((row) => (
          <PaymentItem key={row.store.id} row={row} selected={row.store.id === selectedId} onSelect={onSelectStore} />
        ))}
      </section>
    );

  return (
    <div className="payments flex flex-col">
      <div className="text-[12px] text-gray-200 leading-relaxed">
        <span className="text-red-400 font-bold">{overdue.length} overdue</span> ·{" "}
        <span className="text-[#fbbf24] font-bold">{due.length} due</span> in the next {PAYMENT_WARNING_DAYS} days ·{" "}
        {later.length} later this year
      </div>
      {stores.length < totalStores && (
        <div className="text-[11px] text-gray-400">
          Showing the {stores.length} of {totalStores} stores that match the filters in the Stores tab.
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-center text-[12px] text-gray-400 timeline-empty">
          No next payments in the data. Add a &quot;Next Payment&quot; column to the store sheet.
        </div>
      ) : (
        <>
          {group("Overdue", overdue, "bad")}
          {group(`Due in the next ${PAYMENT_WARNING_DAYS} days`, due, "warn")}
          {group("Later", later, "")}
        </>
      )}
      <div className="text-[11px] text-gray-400 leading-relaxed">
        From the contract register&apos;s Next Payment column.
        {withoutDate > 0 &&
          ` ${withoutDate} ${withoutDate === 1 ? "store has" : "stores have"} no readable next payment (or an ended contract) and ${withoutDate === 1 ? "isn't" : "aren't"} shown.`}
      </div>
    </div>
  );
}

/** The Renewals tab: the 12-month renewals chart, or the payments due. */
export default function RenewalsTab(props: Props) {
  const [view, setView] = useState<View>("renewals");
  const pending = useMemo(() => {
    const on = today();
    return props.stores.filter((s) => {
      const st = paymentInfo(s, on).status;
      return st === "due" || st === "overdue";
    }).length;
  }, [props.stores]);
  return (
    <div className="flex flex-col gap-3">
      <div className="seg renewals-seg" role="tablist" aria-label="Renewals or payments">
        {(
          [
            ["renewals", "Renewals"],
            ["payments", pending ? `Payments (${pending})` : "Payments"],
          ] as [View, string][]
        ).map(([id, text]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            className={`seg-btn ${view === id ? "on" : ""}`}
            onClick={() => setView(id)}
          >
            {text}
          </button>
        ))}
      </div>
      {view === "renewals" ? <RenewalTimeline {...props} /> : <PaymentsList {...props} />}
    </div>
  );
}
