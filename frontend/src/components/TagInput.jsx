import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";

const COLORS = [
  { label: "Gray",   value: "#6b7280" },
  { label: "Red",    value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Amber",  value: "#f59e0b" },
  { label: "Green",  value: "#22c55e" },
  { label: "Blue",   value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink",   value: "#ec4899" },
];

export default function TagInput({ selectedTags = [], onChange, allTags = [], onCreateTag }) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [newColor, setNewColor] = useState("#6b7280");
  const [creating, setCreating] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = allTags.filter(
    (t) =>
      t.name.includes(input.toLowerCase()) &&
      !selectedTags.find((s) => s.id === t.id)
  );

  const addTag = (tag) => {
    onChange([...selectedTags, tag]);
    setInput("");
    setOpen(false);
  };

  const removeTag = (id) => onChange(selectedTags.filter((t) => t.id !== id));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!input.trim() || creating) return;
    setCreating(true);
    try {
      const tag = await onCreateTag(input.trim(), newColor);
      if (tag) addTag(tag);
    } finally {
      setCreating(false);
    }
  };

  const alreadyExists = !!allTags.find(
    (t) => t.name === input.trim().toLowerCase()
  );

  return (
    <div ref={ref} className="relative">
      {/* Input box */}
      <div
        className="flex flex-wrap gap-1.5 items-center border border-gray-200 rounded-md px-2.5 py-1.5 min-h-[36px] bg-white focus-within:ring-1 focus-within:ring-indigo-500 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag.id); }}
              className="hover:opacity-75 leading-none"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedTags.length === 0 ? "Add tags..." : ""}
          className="text-xs outline-none flex-1 min-w-[80px] bg-transparent placeholder:text-gray-400"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-md z-50 overflow-hidden">
          {/* Existing tags */}
          {filtered.length > 0 && (
            <div className="py-1">
              {filtered.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(tag)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-xs text-gray-700">{tag.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Create new */}
          {input.trim() && !alreadyExists && (
            <div className="border-t border-gray-100 p-2.5">
              <p className="text-[11px] text-gray-400 font-semibold mb-2">
                Create tag
              </p>
              {/* Color picker */}
              <div className="flex gap-1.5 mb-2.5 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setNewColor(c.value)}
                    title={c.label}
                    className="w-4 h-4 rounded-full transition-transform"
                    style={{
                      backgroundColor: c.value,
                      outline: newColor === c.value ? `2px solid ${c.value}` : "none",
                      outlineOffset: "2px",
                      transform: newColor === c.value ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCreate}
                disabled={creating}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 rounded-md disabled:opacity-50 transition-colors"
              >
                <Plus size={12} />
                {creating ? "Creating…" : `Create "${input.trim()}"`}
              </button>
            </div>
          )}

          {filtered.length === 0 && !input.trim() && (
            <p className="px-3 py-3 text-xs text-gray-400">
              Type to search or create a tag
            </p>
          )}
        </div>
      )}
    </div>
  );
}