import { useState } from "react";

const inputCls =
  "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";

// Create / edit a goal. onSubmit(fields) should throw on error.
export default function GoalForm({ initial, tags = [], onSubmit, onCancel, submitLabel = "Add goal" }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [period, setPeriod] = useState(initial?.period || "week");
  const [target, setTarget] = useState(initial?.target || 5);
  const [tagId, setTagId] = useState(initial?.tag_id || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({ title, period, target: Number(target), tag_id: tagId || null });
      if (!initial) setTitle("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="e.g. Ship features" value={title}
          onChange={(e) => setTitle(e.target.value)} required />
        <input type="number" min="1" className={`${inputCls} w-20`} value={target}
          onChange={(e) => setTarget(e.target.value)} title="How many Done tasks" />
        <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="week">per week</option>
          <option value="month">per month</option>
        </select>
        <select className={inputCls} value={tagId} onChange={(e) => setTagId(e.target.value)} title="Only count tasks with this tag">
          <option value="">Any task</option>
          {tags.map((t) => <option key={t.id} value={t.id}>Tag: {t.name}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
