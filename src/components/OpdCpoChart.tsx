import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Store } from "../types";
import { CURRENCY, PIN_SEL } from "../constants";
import { useSettings } from "../hooks/useSettings";
import { opdCpoScatter, Quadrant, QUADRANT_LABEL, ScatterPoint } from "../lib/cpo";
import { rentFactor, vatLabel } from "../lib/settings";

interface Props {
  stores: Store[]; // the stores that pass the filters
  selectedId: number | null;
  onSelectStore: (id: number) => void;
}

// Where each quadrant's name sits: its corner of the plot
const CORNERS: Array<[Quadrant, string]> = [
  ["review", "top-left"],
  ["split", "top-right"],
  ["grow", "bottom-left"],
  ["strong", "bottom-right"],
];

const QUADRANT_HINT: Record<Quadrant, string> = {
  split: "Busy and costly: worth splitting into a second store",
  review: "Quiet and costly: review or relocate",
  strong: "Busy and cheap",
  grow: "Quiet but cheap: room to grow",
};

interface Datum extends ScatterPoint {
  shownCpo: number;
}

function PointTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-[#1a1a1a] border border-[#333] p-3 rounded-lg shadow-2xl">
      <p className="text-[12px] font-bold text-white">{p.store.name}</p>
      <p className="text-[11px] text-gray-400">
        {p.store.city} · {QUADRANT_LABEL[p.quadrant]}
      </p>
      <p className="text-[12px] text-gray-200 font-mono">
        OPD {p.opd.toLocaleString()} · CPO {CURRENCY} {p.shownCpo.toFixed(2)}
      </p>
    </div>
  );
}

/**
 * OPD against CPO, one dot per store (with both), and the two medians splitting it into four: Split candidates
 * (high OPD, high CPO), Review / relocate (low OPD, high CPO), Strong (high OPD, low CPO) and Room to grow (low
 * OPD, low CPO). Follows the filters; a dot selects its store.
 */
export default function OpdCpoChart({ stores, selectedId, onSelectStore }: Props) {
  const settings = useSettings();
  const factor = rentFactor(settings.includeVat);
  const { points, medianOpd, medianCpo } = useMemo(() => opdCpoScatter(stores), [stores]);
  const data: Datum[] = points.map((p) => ({ ...p, shownCpo: p.cpo * factor }));
  const counts = useMemo(() => {
    const c: Record<Quadrant, number> = { split: 0, review: 0, strong: 0, grow: 0 };
    for (const p of points) c[p.quadrant]++;
    return c;
  }, [points]);
  const vat = vatLabel(settings);

  return (
    <section className="opd-cpo" aria-label="OPD against CPO">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
          OPD vs CPO{vat && ` (${vat})`}
        </h3>
        <span className="text-[11px] text-gray-400">{points.length} stores</span>
      </div>
      {points.length < 2 ? (
        <p className="nearby-empty">
          {points.length ? "Only one store has" : "No stores have"} both an OPD and a rent, so there&apos;s nothing to
          compare yet. Add an OPD column to the store sheet.
        </p>
      ) : (
        <>
          <div className="opd-cpo-plot">
            {CORNERS.map(([q, corner]) => (
              <span key={q} className={`opd-cpo-quadrant ${corner}`} title={QUADRANT_HINT[q]}>
                {QUADRANT_LABEL[q]}
              </span>
            ))}
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 0, right: 12, top: 24, bottom: 4 }}>
                <CartesianGrid stroke="#2c2c2a" strokeDasharray="0" />
                <XAxis
                  type="number"
                  dataKey="opd"
                  name="OPD"
                  tick={{ fill: "#898781", fontSize: 11 }}
                  axisLine={{ stroke: "#383835" }}
                  tickLine={false}
                  label={{
                    value: "OPD (orders / day)",
                    position: "insideBottom",
                    offset: -2,
                    fill: "#898781",
                    fontSize: 11,
                  }}
                  height={34}
                />
                <YAxis
                  type="number"
                  dataKey="shownCpo"
                  name="CPO"
                  tick={{ fill: "#898781", fontSize: 11 }}
                  axisLine={{ stroke: "#383835" }}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v: number) => v.toFixed(v < 10 ? 1 : 0)}
                />
                <ReferenceLine x={medianOpd} stroke="#6b6b6b" strokeDasharray="4 4" />
                <ReferenceLine y={medianCpo * factor} stroke="#6b6b6b" strokeDasharray="4 4" />
                <Tooltip content={<PointTooltip />} cursor={{ stroke: "#444", strokeDasharray: "3 3" }} />
                <Scatter
                  data={data}
                  onClick={(d: { payload?: Datum }) => d.payload && onSelectStore(d.payload.store.id)}
                  shape={(props: { cx?: number; cy?: number; payload?: Datum }) => {
                    const on = props.payload?.store.id === selectedId;
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={on ? 6.5 : 4.5}
                        fill={on ? PIN_SEL : "#fbbf24"}
                        stroke="#111111"
                        strokeWidth={2}
                        style={{ cursor: "pointer" }}
                        data-store={props.payload?.store.id}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <table className="opd-cpo-table">
            <caption className="sr-only">Stores in each quadrant</caption>
            <tbody>
              {(["split", "review", "strong", "grow"] as Quadrant[]).map((q) => (
                <tr key={q} data-quadrant={q} title={QUADRANT_HINT[q]}>
                  <th scope="row">{QUADRANT_LABEL[q]}</th>
                  <td>{counts[q]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Dashed lines: the medians (OPD {medianOpd.toLocaleString()}, CPO {CURRENCY}{" "}
            {(medianCpo * factor).toFixed(2)}). High means above the median. Click a dot to open its store.
          </p>
        </>
      )}
    </section>
  );
}
