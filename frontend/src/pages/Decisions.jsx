import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Plus, Scale, Search } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import AreaTile from "../components/AreaTile";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const STATUS = {
  proposed: { label: "Proposed", chip: "bg-amber-50 text-amber-700" },
  decided: { label: "Decided", chip: "bg-emerald-50 text-emerald-700" },
  reversed: { label: "Reversed", chip: "bg-gray-100 text-gray-500 line-through" },
};
const who = (u) => u?.name || u?.email;

// The decision log: what was decided, why and by whom — searchable later
export default function Decisions() {
  const companyId = getWorkspace();
  const { teams } = useCompanyPeople();
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", context: "", status: "decided", team_id: "" });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!companyId) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    apiRequest(`/decisions?${params}`).then(setList).catch(() => setList([]));
  }, [companyId, q, status]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (!companyId) return <Navigate to="/dashboard" replace />;

  const save = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await apiRequest("/decisions", "POST", { ...form, team_id: form.team_id || null });
      setForm({ title: "", context: "", status: "decided", team_id: "" });
      setAdding(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const setDecisionStatus = (d, s) => apiRequest(`/decisions/${d.id}`, "PUT", { status: s }).then(load).catch((err) => setError(err.message));

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title"><AreaTile />Decisions</h1>
          <p className="text-sm text-gray-500 mt-1">What was decided and why. Decisions from finished meetings land here too.</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 btn-accent text-sm rounded-md">
            <Plus size={14} /> Log a decision
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 mb-5">
          <input required autoFocus className={`${inputCls} w-full`} placeholder="We decided to…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea rows={3} className={`${inputCls} w-full`} placeholder="Why? What else was considered?" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="decided">Decided</option>
              <option value="proposed">Proposed (not final yet)</option>
            </select>
            <select className={inputCls} value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
              <option value="">Whole company</option>
              {teams.map((t) => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="px-3 py-1.5 btn-accent text-sm rounded-md">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Search decisions" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>

      {list === null && <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />}
      {list?.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-gray-400">
          <Scale size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">{q || status ? "Nothing matches." : "No decisions logged yet."}</p>
        </div>
      )}
      <div className="space-y-2">
        {list?.map((d) => (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex flex-wrap items-start gap-2">
              <p className={`text-sm font-medium text-gray-900 flex-1 min-w-[200px] ${d.status === "reversed" ? "line-through text-gray-400" : ""}`}>{d.title}</p>
              {d.can_edit ? (
                <select className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border-0 ${STATUS[d.status].chip}`} value={d.status}
                  onChange={(e) => setDecisionStatus(d, e.target.value)} aria-label="Status">
                  {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              ) : (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS[d.status].chip}`}>{STATUS[d.status].label}</span>
              )}
            </div>
            {d.context && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{d.context}</p>}
            <p className="text-xs text-gray-400 mt-2">
              {d.decided_on} · {who(d.owner) || who(d.creator)}
              {d.team && <> · {d.team.name}</>}
              {d.project && <> · {d.project.name}</>}
              {d.meeting && <> · from <Link to={`/meetings/${d.meeting.id}`} className="underline">{d.meeting.title}</Link></>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
