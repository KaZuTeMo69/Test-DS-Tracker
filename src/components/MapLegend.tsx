// Pin colours, and how many of the listed stores have no pin
export default function MapLegend({ notOnMap }: { notOnMap: number }) {
  return (
    <div className="absolute bottom-4 left-4 bg-[#111111]/85 backdrop-blur border border-[#333] pl-[10px] pr-[10px] pt-[7px] pb-[7px] rounded-lg flex flex-row items-center gap-4 shadow-2xl z-[500]">
      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
        <div className="w-2 h-2 rounded-full bg-[#4ade80]"></div>
        <span>Live · Paid</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
        <div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div>
        <span>Live · Unpaid</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
        <div className="w-2 h-2 rounded-full bg-[#f87171]"></div>
        <span>Not Live</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
        <div className="w-2 h-2 rounded-full bg-[#60a5fa] shadow-[0_0_5px_rgba(96,165,250,0.5)]"></div>
        <span>Selected</span>
      </div>
      {notOnMap > 0 && (
        <div
          className="flex items-center gap-2 text-[10px] text-[#FB923C] font-bold uppercase tracking-tight"
          title="Stores with missing or implausible coordinates. See the NO LOCATION tag in the list."
        >
          <span>{notOnMap} not on map</span>
        </div>
      )}
    </div>
  );
}
