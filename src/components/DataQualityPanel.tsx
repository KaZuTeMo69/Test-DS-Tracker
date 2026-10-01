import { ReactNode, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { IssueGroup } from "../lib/checks";
import { SheetIssueGroup } from "../lib/sheetPotentials";

interface DataQualityPanelProps {
  groups: IssueGroup[];
  storesWithIssues: number;
  totalStores: number;
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  onBack: () => void;
  potentialsSection?: ReactNode; // the problems in the sheet's Potentials tab, after the stores'
}

const ROW_BATCH = 50;

function Group({
  group,
  selectedId,
  onSelectStore,
}: {
  group: IssueGroup;
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  key?: string;
}) {
  const [shown, setShown] = useState(ROW_BATCH);
  return (
    <details className="quality-group bg-[#111] border border-[#222] rounded-lg" data-kind={group.kind}>
      <summary className="flex items-center gap-2 cursor-pointer">
        <span className="text-[12.5px] font-bold text-white flex-1 min-w-0">{group.title}</span>
        <span className="quality-count text-[11px] font-bold rounded-full">{group.items.length}</span>
      </summary>
      <div className="text-[11px] text-gray-400 quality-fix">{group.fix}</div>
      <div className="flex flex-col">
        {group.items.slice(0, shown).map(({ store, detail }) => (
          <button
            key={store.id}
            onClick={() => onSelectStore(store.id)}
            className={`layer-zone quality-row flex flex-col text-left rounded-md ${store.id === selectedId ? "on" : ""}`}
            title="Open this store"
          >
            <span className="flex items-baseline gap-2 w-full min-w-0">
              <span className="text-[12px] font-bold truncate">{store.name}</span>
              <span className="text-[11px] text-gray-400 font-mono ml-auto shrink-0">
                {store.dsCode || "No DS code"} · {store.city || "No city"}
              </span>
            </span>
            <span className="text-[11px] text-gray-400 leading-snug">{detail}</span>
          </button>
        ))}
        {group.items.length > shown && (
          <button onClick={() => setShown((n) => n + ROW_BATCH)} className="layer-zone text-[11px] text-gray-400">
            Show {Math.min(ROW_BATCH, group.items.length - shown)} more
          </button>
        )}
      </div>
    </details>
  );
}

/** Every problem in the data, grouped by kind with counts. Clicking a store selects it. */
export default function DataQualityPanel({
  groups,
  storesWithIssues,
  totalStores,
  selectedId,
  onSelectStore,
  onBack,
  potentialsSection,
}: DataQualityPanelProps) {
  return (
    <div className="flex flex-col quality">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[#fbbf24] text-[11px] font-black uppercase hover:opacity-80 transition-all cursor-pointer w-fit"
      >
        <ChevronLeft size={14} /> Back to stores
      </button>
      <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Data quality</h3>
      <div className="text-[12.5px] text-gray-100 leading-relaxed">
        {storesWithIssues ? (
          <>
            <b className="text-[#FB923C]">{storesWithIssues}</b> of {totalStores}{" "}
            {totalStores === 1 ? "store has" : "stores have"} something to fix in your data.
          </>
        ) : (
          <span className="text-green-400 font-bold">✓ No problems found in your {totalStores} stores.</span>
        )}
      </div>
      <div className="text-[11px] text-gray-400 leading-relaxed">
        Checks all stores, whatever the filters. Fix them in your Google Sheet or file: the app picks up a sheet's
        changes at the next sync.
      </div>
      {groups.map((group) => (
        <Group key={group.kind} group={group} selectedId={selectedId} onSelectStore={onSelectStore} />
      ))}
      {potentialsSection}
    </div>
  );
}

/**
 * The problems in the rows of the sheet's Potentials tab, grouped by kind. A row on the map opens its Potential;
 * one that isn't (no usable coordinates, or a repeated ID) says where it is in the tab.
 */
export function PotentialsQuality({
  groups,
  rows,
  selectedId,
  onSelectPotential,
}: {
  groups: SheetIssueGroup[];
  rows: number; // rows with any problem
  selectedId: string | null;
  onSelectPotential: (id: string) => void;
}) {
  if (!groups.length) return null;
  return (
    <section className="flex flex-col quality-potentials" aria-label="Potentials tab">
      <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Potentials</h3>
      <div className="text-[12.5px] text-gray-100 leading-relaxed">
        <b className="text-[#FB923C]">{rows}</b> {rows === 1 ? "row" : "rows"} of the Potentials tab{" "}
        {rows === 1 ? "has" : "have"} something to fix. Fix them in Google Sheets: the app picks them up at the next
        sync.
      </div>
      {groups.map((group) => (
        <details
          key={group.kind}
          className="quality-group bg-[#111] border border-[#222] rounded-lg"
          data-kind={`potential-${group.kind}`}
        >
          <summary className="flex items-center gap-2 cursor-pointer">
            <span className="text-[12.5px] font-bold text-white flex-1 min-w-0">{group.title}</span>
            <span className="quality-count text-[11px] font-bold rounded-full">{group.items.length}</span>
          </summary>
          <div className="text-[11px] text-gray-400 quality-fix">{group.fix}</div>
          <div className="flex flex-col">
            {group.items.map((item) => {
              const body = (
                <>
                  <span className="flex items-baseline gap-2 w-full min-w-0">
                    <span className="text-[12px] font-bold truncate">{item.name || "No name"}</span>
                    <span className="text-[11px] text-gray-400 font-mono ml-auto shrink-0">
                      Row {item.row} · {item.id || "No ID"}
                    </span>
                  </span>
                  <span className="text-[11px] text-gray-400 leading-snug">{item.detail}</span>
                </>
              );
              const shownId = item.shownId;
              return shownId ? (
                <button
                  key={`${item.kind}-${item.row}`}
                  onClick={() => onSelectPotential(shownId)}
                  className={`layer-zone quality-row flex flex-col text-left rounded-md ${shownId === selectedId ? "on" : ""}`}
                  title="Open this potential"
                >
                  {body}
                </button>
              ) : (
                <div key={`${item.kind}-${item.row}`} className="layer-zone quality-row off flex flex-col rounded-md">
                  {body}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </section>
  );
}
