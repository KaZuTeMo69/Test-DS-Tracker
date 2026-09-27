import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, FileText, Link, Upload, X } from "lucide-react";
import { Store } from "../types";
import { parseCSVData, parseJSONData } from "../lib/importer";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoresImported: (stores: Store[], sourceName: string) => void;
  onGoogleSheetImport: (url: string) => void;
  isLoading?: boolean;
  loadingMsg?: string;
  error?: string | null;
}

// Choose the parser from the content itself: JSON starts with [ or {, anything else is CSV/TSV
const parseContent = (text: string): Store[] =>
  /^\s*[[{]/.test(text) ? parseJSONData(text) : parseCSVData(text);

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export default function UploadModal({
  isOpen,
  onClose,
  onStoresImported,
  onGoogleSheetImport,
  isLoading,
  loadingMsg,
  error
}: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "sheet" | "paste">("file");
  const [sheetUrl, setSheetUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Don't show an error left over from the last time the window was open
  useEffect(() => {
    if (isOpen) setLocalError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const readFile = (file: File) => {
    setLocalError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseContent(content);

        if (parsed.length === 0) {
          setLocalError("No valid dark store records found in the uploaded file.");
          return;
        }

        onStoresImported(parsed, file.name);
        onClose();
      } catch (err) {
        setLocalError(errorText(err, "Failed to parse file. Please check file format."));
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    // Without preventDefault the browser opens the dropped file and leaves the dashboard
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setActiveTab("file");
    readFile(file);
  };

  const handlePasteSubmit = () => {
    setLocalError(null);
    if (!pastedText.trim()) return;

    try {
      const parsed = parseContent(pastedText);

      if (parsed.length === 0) {
        setLocalError("Could not parse valid store rows from pasted content.");
        return;
      }

      onStoresImported(parsed, "Pasted Data");
      onClose();
    } catch (err) {
      setLocalError(errorText(err, "Invalid data format."));
    }
  };

  const handleSheetSubmit = () => {
    setLocalError(null);
    if (!sheetUrl.trim()) return;
    onGoogleSheetImport(sheetUrl.trim());
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9000] backdrop-blur-md p-4 sm:p-6"
      onClick={onClose}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div 
        className="relative bg-[#111111] border border-[#262626] rounded-[24px] p-6 sm:p-8 w-full max-w-[580px] duration-200 shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[92vh] scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer border border-[#262626]"
          title="Close"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#fbbf24]/10 border border-[#fbbf24]/20 flex items-center justify-center text-[#fbbf24]">
            <Upload size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-['Oswald'] tracking-wide text-white uppercase italic">Import Store Data</h2>
            <p className="text-xs text-gray-400">Upload a CSV/JSON file or sync from Google Sheets</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-[#1a1a1a] p-1 rounded-xl border border-[#262626] mb-6">
          <button
            onClick={() => setActiveTab("file")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === "file" ? "bg-[#fbbf24] text-black shadow" : "text-gray-400 hover:text-white"}`}
          >
            <Upload size={14} />
            <span>Upload File</span>
          </button>
          <button
            onClick={() => setActiveTab("sheet")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === "sheet" ? "bg-[#fbbf24] text-black shadow" : "text-gray-400 hover:text-white"}`}
          >
            <Link size={14} />
            <span>Google Sheet</span>
          </button>
          <button
            onClick={() => setActiveTab("paste")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === "paste" ? "bg-[#fbbf24] text-black shadow" : "text-gray-400 hover:text-white"}`}
          >
            <FileText size={14} />
            <span>Paste CSV</span>
          </button>
        </div>

        {/* File Tab */}
        {activeTab === "file" && (
          <div className="space-y-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed ${isDragging ? "border-[#fbbf24] bg-[#1c1c1c]" : "border-[#333] bg-[#161616]"} hover:border-[#fbbf24] hover:bg-[#1c1c1c] rounded-2xl p-8 text-center cursor-pointer transition-all group`}
            >
              <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-[#fbbf24]/20 text-gray-400 group-hover:text-[#fbbf24] flex items-center justify-center mx-auto mb-3 transition-colors">
                <Upload size={24} />
              </div>
              <p className="text-sm font-bold text-white mb-1">Click or Drag & Drop File</p>
              <p className="text-xs text-gray-500">Supports .csv and .json store datasets</p>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv,.json,.txt" 
              onChange={handleFileUpload} 
            />
          </div>
        )}

        {/* Google Sheet Tab */}
        {activeTab === "sheet" && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                Google Sheets Public Link
              </label>
              <input 
                type="url" 
                placeholder="https://docs.google.com/spreadsheets/d/..." 
                className="w-full bg-[#161616] border border-[#262626] hover:border-[#333] focus:border-[#fbbf24] text-white text-xs font-mono outline-none transition-all placeholder:text-gray-600 rounded-xl px-4 py-3"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSheetSubmit()}
              />
              <p className="text-[11px] text-gray-500 mt-2">
                Ensure sheet sharing is set to <span className="text-gray-300 font-bold">"Anyone with link → Viewer"</span>.
              </p>
            </div>

            <button 
              disabled={!sheetUrl.trim() || isLoading}
              onClick={handleSheetSubmit}
              className="w-full bg-[#fbbf24] disabled:bg-[#fbbf24]/30 disabled:text-black/40 text-black border-none rounded-xl py-3 font-extrabold text-xs cursor-pointer tracking-wider hover:opacity-90 active:scale-[0.99] transition-all uppercase flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>{loadingMsg || "Connecting to Sheet..."}</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>Sync Google Sheet</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Paste CSV Tab */}
        {activeTab === "paste" && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
                Paste Raw CSV / TSV Content
              </label>
              <textarea 
                rows={6}
                placeholder="Store Name, City, DS Code, Area, Rent, Lat, Lng..."
                className="w-full bg-[#161616] border border-[#262626] focus:border-[#fbbf24] text-white text-xs font-mono outline-none transition-all placeholder:text-gray-600 rounded-xl p-3 resize-none scrollbar-thin"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />
            </div>

            <button 
              disabled={!pastedText.trim()}
              onClick={handlePasteSubmit}
              className="w-full bg-[#fbbf24] disabled:bg-[#fbbf24]/30 disabled:text-black/40 text-black border-none rounded-xl py-3 font-extrabold text-xs cursor-pointer tracking-wider hover:opacity-90 active:scale-[0.99] transition-all uppercase flex items-center justify-center gap-2"
            >
              <Check size={16} />
              <span>Import Pasted Content</span>
            </button>
          </div>
        )}

        {(localError || error) && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{localError || error}</span>
          </div>
        )}

        {/* Schema hint */}
        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">
            Recommended Header Fields
          </p>
          <p className="text-[10px] font-mono text-gray-400 leading-relaxed">
            Store Name · City · DS Code · Contract Duration · Paid/Unpaid · Live Status · Area (sqm) · Annual Rent · Lat · Lng
          </p>
        </div>
      </div>
    </div>
  );
}
