import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { apiRequest } from "../utils/api";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const emptyItem = () => ({ title: "", days: 0 });

// One checklist being edited (new or existing)
function Editor({ initial, teams, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const setItem = (i, patch) => setForm({ ...form, items: form.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <input required className={`${inputCls} flex-1 min-w-[180px]`} placeholder="Checklist name, e.g. Engineering onboarding"
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={inputCls} value={form.team_id || ""} onChange={(e) => setForm({ ...form, team_id: e.target.value })} title="Put the tasks on a team">
          <option value="">Tasks not on a team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>On team {t.name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {form.items.map((it, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
            <input className={`${inputCls} flex-1`} placeholder="Task, e.g. Set up your laptop" value={it.title}
              onChange={(e) => setItem(i, { title: e.target.value })} />
            <label className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
              due day
              <input type="number" min="0" max="365" className={`${inputCls} w-16 py-1.5`} value={it.days}
                onChange={(e) => setItem(i, { days: e.target.value })} />
            </label>
            <button type="button" className="p-1 text-gray-300 hover:text-rose-500" aria-label="Remove task"
              onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}>
              <X size={14} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}
          className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 ml-7">
          <Plus size={12} /> Add task
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
        Give this to everyone who joins (unless an invite picks another checklist)
      </label>
      <div className="flex gap-2">
        <button className="px-3 py-1.5 btn-accent text-sm rounded-md">Save checklist</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
      </div>
    </form>
  );
}

// Onboarding checklists: tasks a new joiner gets on day one. Admins edit; managers can hand them out.
export default function OnboardingChecklists({ company }) {
  const canEdit = ["owner", "admin"].includes(company.my_role);
  const [templates, setTemplates] = useState(null);
  const [teams, setTeams] = useState([]);
  const [people, setPeople] = useState([]);
  const [editing, setEditing] = useState(null); // "new" | template id
  const [assign, setAssign] = useState({});
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    () => apiRequest(`/companies/${company.id}/onboarding`).then(setTemplates).catch((err) => setError(err.message)),
    [company.id]
  );
  useEffect(() => {
    load();
    apiRequest(`/companies/${company.id}/org`).then((o) => { setTeams(o.teams); setPeople(o.people); }).catch(() => {});
  }, [company.id, load]);

  const run = async (fn, done) => {
    setError("");
    setMsg("");
    try {
      const out = await fn();
      done?.(out);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const save = (t) => (form) => {
    const body = { ...form, team_id: form.team_id || null, items: form.items.filter((i) => i.title.trim()) };
    run(() => (t ? apiRequest(`/companies/${company.id}/onboarding/${t.id}`, "PUT", body)
      : apiRequest(`/companies/${company.id}/onboarding`, "POST", body)), () => setEditing(null));
  };

  if (!templates) return error ? <p className="text-sm text-gray-500">{error}</p> : <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-500">A checklist turns into tasks assigned to a new joiner, each due a number of days after they join.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {canEdit && editing !== "new" && (
        <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 text-sm border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 bg-white">
          <Plus size={14} /> New checklist
        </button>
      )}
      {editing === "new" && (
        <Editor initial={{ name: "", team_id: "", is_default: templates.length === 0, items: [emptyItem(), emptyItem(), emptyItem()] }}
          teams={teams} onSave={save(null)} onCancel={() => setEditing(null)} />
      )}
      {templates.length === 0 && editing !== "new" && <p className="text-sm text-gray-400">No checklists yet.</p>}

      {templates.map((t) =>
        editing === t.id ? (
          <Editor key={t.id} initial={{ ...t, team_id: t.team_id || "" }} teams={teams} onSave={save(t)} onCancel={() => setEditing(null)} />
        ) : (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 flex-1">
                {t.name}
                {t.is_default && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">everyone who joins</span>}
              </h3>
              {canEdit && <button onClick={() => setEditing(t.id)} className="text-xs text-gray-500 hover:text-gray-900">Edit</button>}
              {canEdit && (
                <button className="p-1 text-gray-300 hover:text-rose-500" title="Delete checklist"
                  onClick={() => window.confirm(`Delete "${t.name}"? Tasks already given out stay.`) &&
                    run(() => apiRequest(`/companies/${company.id}/onboarding/${t.id}`, "DELETE"))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <ol className="mt-2 space-y-0.5 text-sm text-gray-700 list-decimal pl-5">
              {t.items.map((it, i) => (
                <li key={i}>{it.title} <span className="text-xs text-gray-400">{it.days ? `· day ${it.days}` : "· day 1"}</span></li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <select className={`${inputCls} text-xs py-1.5`} value={assign[t.id] || ""} onChange={(e) => setAssign({ ...assign, [t.id]: e.target.value })}>
                <option value="">Give to someone already here…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
              </select>
              <button disabled={!assign[t.id]} className="px-2.5 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50 disabled:opacity-40"
                onClick={() => run(() => apiRequest(`/companies/${company.id}/onboarding/${t.id}/assign`, "POST", { user_id: assign[t.id] }),
                  (out) => setMsg(`${out.tasks} tasks assigned`))}>
                Assign
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
