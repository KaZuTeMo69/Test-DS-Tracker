import { useState } from "react";
import { ChevronDown, FileEdit, RefreshCw, Settings, Store as StoreIcon, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

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
  let title = "Sample stores for trying the app. Use Upload Data to load your own.";
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
      className={`flex items-center gap-2 min-w-0 px-3 py-1.5 border rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${BADGE_TONE[tone].pill}`}
      title={title}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${BADGE_TONE[tone].dot} ${label === "Connecting" ? "animate-pulse" : ""}`}
      />
      <span>{label}</span>
      {detail && (
        <span className="hidden md:inline font-mono font-normal normal-case tracking-normal truncate max-w-[160px]">
          · {detail}
        </span>
      )}
    </div>
  );
}

interface HeaderProps {
  sheetId: string;
  lastSync: string;
  syncError: string | null;
  fileName: string | null;
  isSyncing: boolean;
  onUpload: () => void;
  onSync: () => void;
  onResetSample: () => void;
}

export default function Header({
  sheetId,
  lastSync,
  syncError,
  fileName,
  isSyncing,
  onUpload,
  onSync,
  onResetSample,
}: HeaderProps) {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  return (
    <header className="app-header h-14 flex-shrink-0 bg-[#111111] border border-[#262626] rounded-xl flex items-center pl-4 pr-4 z-50 gap-4 shadow-lg mx-[5px]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/20 flex items-center justify-center text-[#fbbf24] shadow-sm">
          <StoreIcon size={18} />
        </div>
        <div className="h-5 w-[1px] bg-white/10"></div>
        <span className="logo-text text-sm font-bold tracking-wider hidden sm:inline uppercase font-['Oswald'] italic text-white">
          Dark Store <span className="text-[#fbbf24]">Tracker</span>
        </span>
      </div>

      <div className="flex-1"></div>

      <SourceBadge sheetId={sheetId} lastSync={lastSync} syncError={syncError} fileName={fileName} />

      <div className="flex items-center gap-2.5 relative">
        <button
          onClick={onUpload}
          className="px-3.5 py-2 bg-[#fbbf24] hover:bg-[#ffe169] text-black border-none rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 uppercase tracking-wider"
          title="Upload CSV/JSON file or sync Google Sheet"
        >
          <Upload size={14} />
          <span className="hidden sm:inline">Upload Data</span>
        </button>

        {sheetId && (
          <button
            onClick={onSync}
            className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#fbbf24] rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-[#EFEFEF] cursor-pointer shadow-sm active:scale-95"
            title="Sync from Google Sheet"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin text-[#fbbf24]" : ""} />
            <span className="hidden md:inline uppercase">Sync Sheet</span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className={`flex items-center gap-1.5 h-9 px-2.5 bg-[#1a1a1a] border ${showSettingsMenu ? "border-[#fbbf24]" : "border-[#333]"} hover:border-[#fbbf24] rounded-lg text-sm transition-all cursor-pointer text-[#9a9a9a] active:scale-95`}
            title="Settings"
          >
            <Settings size={16} className={showSettingsMenu ? "text-[#fbbf24]" : ""} />
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${showSettingsMenu ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {showSettingsMenu && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setShowSettingsMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-48 bg-[#111111] border border-[#262626] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[101] overflow-hidden"
                >
                  <div className="p-1.5 flex flex-col gap-1">
                    <button
                      onClick={() => {
                        onUpload();
                        setShowSettingsMenu(false);
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-[11px] font-black uppercase text-gray-300 hover:text-[#fbbf24] hover:bg-white/5 rounded-lg transition-all text-left"
                    >
                      <FileEdit size={14} />
                      <span>Import / Upload</span>
                    </button>

                    <button
                      onClick={() => {
                        onResetSample();
                        setShowSettingsMenu(false);
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-[11px] font-black uppercase text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-left"
                    >
                      <RefreshCw size={14} />
                      <span>Reset Sample Data</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
