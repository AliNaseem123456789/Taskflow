import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

// "g" then a letter jumps to a page
const GO_TO = {
  d: ["/dashboard", "Dashboard"],
  m: ["/mydones", "My Dones"],
  c: ["/calendar", "Calendar"],
  s: ["/search", "Search"],
  t: ["/team", "Team"],
  r: ["/reports", "Reports"],
  p: ["/profile", "Profile"],
};

const HELP = [
  ["n", "New task"],
  ["/", "Search"],
  ...Object.entries(GO_TO).map(([key, [, label]]) => [`g ${key}`, `Go to ${label}`]),
  ["?", "Show this list"],
  ["Esc", "Close"],
];

// Don't steal keys while the user is typing
const isTyping = (el) =>
  el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export default function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const waitingForG = useRef(false);

  useEffect(() => {
    let timer;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") return setShowHelp(false);
      if (isTyping(document.activeElement)) return;

      if (waitingForG.current) {
        waitingForG.current = false;
        const target = GO_TO[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          navigate(target[0]);
        }
        return;
      }

      if (e.key === "g") {
        waitingForG.current = true;
        clearTimeout(timer);
        timer = setTimeout(() => (waitingForG.current = false), 1000);
      } else if (e.key === "n") {
        e.preventDefault();
        navigate("/mydones?new=1");
      } else if (e.key === "/") {
        e.preventDefault();
        navigate("/search");
      } else if (e.key === "?") {
        setShowHelp((v) => !v);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [navigate]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Keyboard shortcuts</h2>
          <button onClick={() => setShowHelp(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <ul className="p-4 space-y-2">
          {HELP.map(([keys, label]) => (
            <li key={keys} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{label}</span>
              <span className="flex gap-1">
                {keys.split(" ").map((k) => (
                  <kbd key={k} className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-gray-200 rounded text-gray-700">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
