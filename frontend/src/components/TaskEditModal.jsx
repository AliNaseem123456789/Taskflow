import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import TagInput from "./TagInput";
import { apiRequest } from "../utils/api";
import { STATUSES, PRIORITIES, RECURRENCES } from "../utils/taskMeta";
import { useMyProjects } from "../utils/projects";

const inputCls =
  "w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const labelCls = "block text-xs font-medium text-gray-500 mb-1";

// Edit every field of a task. onSaved(updatedTask) after a successful save.
export default function TaskEditModal({ task, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: task.title || "",
    description: task.description || "",
    status: task.status || "Doing",
    priority: task.priority || "medium",
    due_date: task.due_date || "",
    date_logged: task.date_logged || "",
    blocker: task.blocker || "",
    recurrence: task.recurrence || "",
    project_id: task.project_id || "",
  });
  const projects = useMyProjects();
  const [tags, setTags] = useState(task.tags || []);
  const [allTags, setAllTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/tags").then(setAllTags).catch(() => {});
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const createTag = async (name, color) => {
    try {
      const tag = await apiRequest("/tags", "POST", { name, color });
      setAllTags((prev) => [...prev, tag]);
      return tag;
    } catch {
      return null;
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await apiRequest(`/tasks/${task.id}`, "PUT", {
        ...form,
        tags: tags.map((t) => t.id),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={onClose}>
      <form
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white border border-gray-200 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Edit task</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={form.title} onChange={set("title")} required autoFocus />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} min-h-[70px]`} value={form.description} onChange={set("description")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={form.priority} onChange={set("priority")}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Logged on</label>
              <input type="date" className={inputCls} value={form.date_logged} onChange={set("date_logged")} />
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={set("due_date")} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Repeat</label>
            <select
              className={inputCls}
              value={form.recurrence}
              onChange={set("recurrence")}
              disabled={!!task.recurrence_parent_id}
              title={task.recurrence_parent_id ? "This is a copy of a repeating task — edit the original to change it" : ""}
            >
              {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {form.recurrence && (
              <p className="text-xs text-gray-400 mt-1">A new copy is added as "Doing" each day it repeats.</p>
            )}
          </div>
          {(projects.length > 0 || form.project_id) && (
            <div>
              <label className={labelCls}>Team project</label>
              <select className={inputCls} value={form.project_id} onChange={set("project_id")}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.team_name})</option>)}
                {form.project_id && !projects.some((p) => p.id === form.project_id) && task.project && (
                  <option value={form.project_id}>{task.project.name}</option>
                )}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>What's blocking you?</label>
            <input className={inputCls} value={form.blocker} onChange={set("blocker")} placeholder="Leave empty if nothing" />
          </div>
          <div>
            <label className={labelCls}>Tags</label>
            <TagInput selectedTags={tags} onChange={setTags} allTags={allTags} onCreateTag={createTag} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
