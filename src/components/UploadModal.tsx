import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  FileUp,
  Link,
  Loader2,
  LucideIcon,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
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
const parseContent = (text: string): Store[] => (/^\s*[[{]/.test(text) ? parseJSONData(text) : parseCSVData(text));

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

type Tab = "file" | "sheet" | "paste";
const TABS: [Tab, string, LucideIcon][] = [
  ["file", "Upload file", Upload],
  ["sheet", "Google Sheet", Link],
  ["paste", "Paste CSV", FileText],
];

// The same test the sheet import makes, so the button only turns on for a link it can use
const SHEET_LINK = /\/spreadsheets\/d\/[a-zA-Z0-9\-_]+/;

// The headers the importer looks for (it also knows common variants of each)
const COLUMNS = [
  "Store Name",
  "City",
  "DS Code",
  "Contract Start Date",
  "Contract End Date",
  "Contract Duration",
  "Paid / Not Paid",
  "Live / Not Live",
  "Area (sqm)",
  "Annual Rent",
  "Lat",
  "Lng",
];

export default function UploadModal({
  isOpen,
  onClose,
  onStoresImported,
  onGoogleSheetImport,
  isLoading,
  loadingMsg,
  error,
}: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("file");
  const [sheetUrl, setSheetUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Don't show an error left over from the last time the window was open
  useEffect(() => {
    if (isOpen) setLocalError(null);
  }, [isOpen]);

  // Esc closes the window (and only the window: preventDefault tells the page it's been used)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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

  const sheetLinkOk = SHEET_LINK.test(sheetUrl);
  const sheetLinkWrong = sheetUrl.trim() !== "" && !sheetLinkOk;
  const pastedRows = pastedText.trim() ? pastedText.trim().split(/\r?\n/).length - 1 : 0;
  const shownError = localError || error;

  return (
    <div
      data-modal
      className="modal-backdrop fixed inset-0 bg-black/75 flex items-center justify-center z-[9000] backdrop-blur-md"
      onClick={onClose}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="modal-card import-modal relative bg-[#111111] border border-[#2a2a2a] rounded-[20px] w-full shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-icon">
            <Upload size={19} />
          </div>
          <div className="min-w-0">
            <h2 id="import-title" className="modal-title">
              Import store data
            </h2>
            <p className="modal-subtitle">From a file, a Google Sheet, or rows pasted from a spreadsheet.</p>
          </div>
          <button onClick={onClose} className="modal-close" title="Close" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          {/* Outside the tabs, so a file can be taken whichever tab is showing */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv,.json,.txt"
            onChange={handleFileUpload}
          />
          <div className="seg" role="tablist" aria-label="Where the data comes from">
            {TABS.map(([tab, label, Icon]) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab);
                  setLocalError(null);
                }}
                className={`seg-btn ${activeTab === tab ? "on" : ""}`}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {activeTab === "file" && (
            <div role="tabpanel" className="modal-section">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`dropzone ${isDragging ? "dragging" : ""}`}
              >
                <span className="dropzone-icon">
                  <FileUp size={24} />
                </span>
                <span className="dropzone-title">
                  {isDragging ? "Drop it here" : "Drop a file here, or click to choose"}
                </span>
                <span className="dropzone-hint">CSV or JSON, with a header row</span>
                <span className="flex gap-1.5 justify-center">
                  {[".csv", ".json", ".txt"].map((ext) => (
                    <span key={ext} className="file-chip">
                      {ext}
                    </span>
                  ))}
                </span>
              </button>
            </div>
          )}

          {activeTab === "sheet" && (
            <div role="tabpanel" className="modal-section">
              <ol className="steps">
                <li>
                  <span className="step-n">1</span>
                  <span>
                    In Google Sheets, click <b>Share</b> and set General access to <b>Anyone with the link</b> ·{" "}
                    <b>Viewer</b>.
                  </span>
                </li>
                <li>
                  <span className="step-n">2</span>
                  <span>Copy the link from the address bar and paste it here.</span>
                </li>
              </ol>

              <label className="field">
                <span className="field-label">Sheet link</span>
                <span className="field-box">
                  <Link size={15} className="field-icon" />
                  <input
                    type="url"
                    autoFocus
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    className={`field-input font-mono ${sheetLinkWrong ? "invalid" : ""}`}
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sheetLinkOk && handleSheetSubmit()}
                    aria-invalid={sheetLinkWrong}
                  />
                </span>
                {sheetLinkWrong && (
                  <span className="field-help warn">
                    That isn't a Google Sheets link. It should contain <b>/spreadsheets/d/</b>.
                  </span>
                )}
              </label>

              <button disabled={!sheetLinkOk || isLoading} onClick={handleSheetSubmit} className="btn-primary">
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{loadingMsg || "Connecting to the sheet…"}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={15} />
                    <span>Sync Google Sheet</span>
                  </>
                )}
              </button>
              <p className="modal-note">
                <ShieldCheck size={14} className="shrink-0" />
                <span>
                  It refreshes every 5 minutes while the page is open. The link is kept only in this browser and is
                  never put in the page's address, so links you share don't show your data.
                </span>
              </p>
            </div>
          )}

          {activeTab === "paste" && (
            <div role="tabpanel" className="modal-section">
              <label className="field">
                <span className="field-label flex justify-between">
                  <span>Rows from a spreadsheet, header row first</span>
                  {pastedRows > 0 && (
                    <span className="normal-case tracking-normal text-gray-300">
                      {pastedRows} {pastedRows === 1 ? "row" : "rows"}
                    </span>
                  )}
                </span>
                <textarea
                  rows={7}
                  autoFocus
                  placeholder={
                    "Store Name, City, DS Code, Contract Start Date, Contract Duration, …\nAl Malqa Depot, Riyadh, DS-102, 01 Mar 2024, 3, …"
                  }
                  className="field-input field-textarea font-mono scrollbar-thin"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
                <span className="field-help">
                  Comma- or tab-separated: copying cells from Excel or Google Sheets works.
                </span>
              </label>

              <button disabled={!pastedText.trim()} onClick={handlePasteSubmit} className="btn-primary">
                <Check size={16} />
                <span>Import pasted data</span>
              </button>
            </div>
          )}

          {shownError && (
            <div className="modal-error" role="alert">
              <AlertCircle size={16} className="shrink-0" />
              <span>{shownError}</span>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <p className="field-label">Columns it reads</p>
          <div className="col-chips">
            {COLUMNS.map((c) => (
              <span key={c} className={`col-chip ${c === "Store Name" ? "required" : ""}`}>
                {c}
              </span>
            ))}
          </div>
          <p className="field-help">
            Matched by header name, in any order. Only <b>Store Name</b> is required; anything else missing is left
            blank and listed under Data quality.
          </p>
        </footer>
      </div>
    </div>
  );
}
