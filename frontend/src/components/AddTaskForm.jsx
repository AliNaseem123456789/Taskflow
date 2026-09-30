import { useState, useEffect } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import TagInput from "./TagInput";
import { apiRequest } from "../utils/api";

export default function AddTaskForm({ onAdd, onCancel, dateLogged }) {
  const [title, setTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    apiRequest("/tags", "GET", null)
      .then(setAllTags)
      .catch(() => {});
  }, []);

  const handleCreateTag = async (name, color) => {
    try {
      const tag = await apiRequest("/tags", "POST", { name, color });
      setAllTags((prev) => [...prev, tag]);
      return tag;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onAdd(title.trim(), selectedTags.map((t) => t.id), dateLogged);
      setTitle("");
      setSelectedTags([]);
      setShowTags(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-lg p-3 space-y-2"
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <Plus size={14} className="text-gray-400 shrink-0" />
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What did you accomplish?"
          className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"
        />
      </div>

      {/* Tag picker toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowTags((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${showTags ? "rotate-180" : ""}`}
          />
          {selectedTags.length > 0
            ? `${selectedTags.length} tag${selectedTags.length > 1 ? "s" : ""} selected`
            : "Add tags"}
        </button>

        {showTags && (
          <div className="mt-2">
            <TagInput
              selectedTags={selectedTags}
              onChange={setSelectedTags}
              allTags={allTags}
              onCreateTag={handleCreateTag}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
        >
          <X size={12} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || loading}
          className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors font-medium"
        >
          {loading ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}