import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";

// "Export ▾" button with JSON / CSV / PDF options.
// onExport(format) is called with "json" | "csv" | "pdf".
export default function ExportMenu({ onExport, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (format) => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          className ||
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        }
      >
        <Download size={13} />
        Export
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
          {[
            ["csv", "CSV (Excel)"],
            ["pdf", "PDF"],
            ["json", "JSON"],
          ].map(([format, label]) => (
            <button
              key={format}
              onClick={() => pick(format)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
