import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { FIELD_KINDS } from "../../utils/fields";

const inputCls = "text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";

// The lead's editor for a project's custom fields
export default function ProjectFields({ team, project, onClose, onChanged }) {
  const base = `/teams/${team.id}/projects/${project.id}/fields`;
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: "", kind: "text", options: "" });
  const [error, setError] = useState("");
  const load = useCallback(() => apiRequest(base).then(setData).catch((err) => setError(err.message)), [base]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setError("");
    try { await fn(); await load(); onChanged?.(); } catch (err) { setError(err.message); }
  };
  const splitOptions = (s) => s.split(",").map((o) => o.trim()).filter(Boolean);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Fields on this project's tasks</p>
          <p className="text-xs text-gray-500">Extra details every task here can have — they show on the task, the board and in request forms.</p>
        </div>
        <button onClick={onClose} aria-label="Close fields" className="p-1 text-gray-400 hover:text-gray-900"><X size={16} /></button>
      </div>
      {data?.fields.length === 0 && <p className="text-xs text-gray-400">No fields yet.</p>}
      <div className="divide-y divide-gray-50">
        {data?.fields.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 py-2">
            <input className={`${inputCls} w-44`} defaultValue={f.name} aria-label={`Rename ${f.name}`} disabled={!data.can_edit}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== f.name && act(() => apiRequest(`${base}/${f.id}`, "PUT", { name: e.target.value }))} />
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{FIELD_KINDS.find(([k]) => k === f.kind)?.[1]}</span>
            {f.kind === "select" && (
              <input className={`${inputCls} flex-1 min-w-40`} defaultValue={f.options.join(", ")} aria-label={`Choices for ${f.name}`} disabled={!data.can_edit}
                onBlur={(e) => e.target.value !== f.options.join(", ") && act(() => apiRequest(`${base}/${f.id}`, "PUT", { options: splitOptions(e.target.value) }))} />
            )}
            {data.can_edit && (
              <button aria-label={`Delete ${f.name}`} className="ml-auto p-1 text-gray-300 hover:text-rose-500"
                onClick={() => window.confirm(`Delete "${f.name}" and its values on every task?`) && act(() => apiRequest(`${base}/${f.id}`, "DELETE"))}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {data?.can_edit && (
        <form className="flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            await apiRequest(base, "POST", { name: form.name, kind: form.kind, options: splitOptions(form.options) });
            setForm({ name: "", kind: form.kind, options: "" });
          });
        }}>
          <input className={`${inputCls} w-44`} placeholder="Field name, e.g. Customer" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Field type">
            {FIELD_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {form.kind === "select" && <input className={`${inputCls} flex-1 min-w-40`} placeholder="Choices, comma separated" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />}
          <button className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md"><Plus size={13} /> Add field</button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
