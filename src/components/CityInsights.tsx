import { CitySummary } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { fmtN } from "../constants";

interface CityInsightsProps {
  citySummaries: CitySummary[];
  currency: "USD" | "AED" | "SAR";
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
  }>;
  label?: string;
}

export default function CityInsights({ citySummaries, currency }: CityInsightsProps) {
  // Sort by count for one view, by rent for another
  const topByCount = [...citySummaries].sort((a, b) => b.count - a.count).slice(0, 8);
  const topByRent = [...citySummaries].sort((a, b) => b.annualRent - a.annualRent).slice(0, 8);

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1a1a1a] border border-[#333] p-3 rounded-lg shadow-2xl">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-[13px] font-bold text-white">
            {payload[0].name === "Stores" ? `${payload[0].value} Stores` : `${currency} ${fmtN(payload[0].value)}`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Store Distribution</h3>
        </div>
        <div className="h-[200px] w-full bg-black/20 rounded-xl p-4 border border-white/5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topByCount} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={true} vertical={false} />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="city" 
                type="category" 
                width={70} 
                tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }} 
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="count" name="Stores" radius={[0, 4, 4, 0]} barSize={12}>
                {topByCount.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? "#fbbf24" : "#444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Rent Contribution (Annual)</h3>
        </div>
        <div className="h-[200px] w-full bg-black/20 rounded-xl p-4 border border-white/5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topByRent} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={true} vertical={false} />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="city" 
                type="category" 
                width={70} 
                tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }} 
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="annualRent" name="Rent" radius={[0, 4, 4, 0]} barSize={12}>
                {topByRent.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index < 3 ? "#fbbf24" : "#666"} opacity={0.8 - index * 0.1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#111] border border-[#222] p-4 rounded-xl">
          <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Avg Rent/Store</div>
          <div className="text-sm font-bold text-white font-mono">
            {currency} {citySummaries.length > 0 
              ? fmtN(citySummaries.reduce((a, b) => a + b.annualRent, 0) / citySummaries.reduce((a, b) => a + b.count, 0)) 
              : "0"}
          </div>
        </div>
        <div className="bg-[#111] border border-[#222] p-4 rounded-xl">
          <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Expansion Health</div>
          <div className="text-sm font-bold text-green-500 font-mono">
            {citySummaries.length > 0 
              ? Math.round((citySummaries.reduce((a, b) => a + b.live, 0) / citySummaries.reduce((a, b) => a + b.count, 0)) * 100) 
              : "0"}% Live
          </div>
        </div>
      </div>
    </div>
  );
}
