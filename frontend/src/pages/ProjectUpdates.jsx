import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
import { apiRequest } from "../utils/api";
import { aiRequest, useAI } from "../utils/ai";
import { Sparkles } from "lucide-react";
import { getWorkspace } from "../api/api";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const HEALTH = {
  on_track: { label: "On track", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  at_risk: { label: "At risk", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  off_track: { label: "Off track", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};
const who = (u) => u?.name || u?.email;

function Stats({ s }) {
  if (!s) return null;
  return (
    <p className="text-xs text-gray-500">
      {s.done_this_week} done this week · {s.open} open{s.overdue > 0 && <span className="text-rose-600"> · {s.overdue} overdue</span>}
    </p>
  );
}

// One project: its history and (for leads) the "post an update" form
function ProjectHistory({ project, onPosted }) {
  const base = `/teams/${project.team_id}/projects/${project.id}/updates`;
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ health: project.latest?.health || "on_track", summary: "", highlights: "", risks: "", next_steps: "" });
  const [error, setError] = useState("");
  const ai = useAI();
  const [drafting, setDrafting] = useState(false);
  const draft = async () => {
    setDrafting(true);
    setError("");
    try {
      const d = await aiRequest("/api/projects/update-draft", { team_id: project.team_id, project_id: project.id });
      setForm({ health: d.health, summary: d.summary || "", highlights: d.highlights || "", risks: d.risks || "", next_steps: d.next_steps || "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setDrafting(false);
    }
  };
  const load = useCallback(() => apiRequest(base).then(setData).catch((err) => setError(err.message)), [base]);
  useEffect(() => { load(); }, [load]);

  const post = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await apiRequest(base, "POST", form);
      setForm({ ...form, summary: "", highlights: "", risks: "", next_steps: "" });
      load();
      onPosted();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!data) return <p className="text-xs text-gray-400 px-4 pb-4">{error || "Loading…"}</p>;
  return (
    <div className="px-4 pb-4 space-y-4">
      {data.can_post && (
        <form onSubmit={post} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600">New update</span>
            {Object.entries(HEALTH).map(([k, h]) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, health: k })}
                className={`text-xs px-2.5 py-1 rounded-full border ${form.health === k ? `${h.chip} border-transparent font-semibold` : "border-gray-200 text-gray-500 bg-white"}`}>
                {h.label}
              </button>
            ))}
            {ai.on && (
              <button type="button" onClick={draft} disabled={drafting} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50">
                <Sparkles size={12} /> {drafting ? "Drafting…" : "Draft with AI"}
              </button>
            )}
            <span className="ml-auto"><Stats s={data.current} /></span>
          </div>
          <textarea required rows={2} className={`${inputCls} w-full`} placeholder="Where things stand, in a sentence or two" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          <div className="grid sm:grid-cols-3 gap-2">
            <textarea rows={2} className={inputCls} placeholder="Highlights" value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} />
            <textarea rows={2} className={inputCls} placeholder="Risks / blockers" value={form.risks} onChange={(e) => setForm({ ...form, risks: e.target.value })} />
            <textarea rows={2} className={inputCls} placeholder="Next steps" value={form.next_steps} onChange={(e) => setForm({ ...form, next_steps: e.target.value })} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md">Post update</button>
        </form>
      )}
      {data.updates.length === 0 && <p className="text-xs text-gray-400">No updates yet{data.can_post ? "" : " — the team lead posts them"}.</p>}
      {data.updates.map((u) => (
        <div key={u.id} className="border-l-2 border-gray-200 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${HEALTH[u.health].chip}`}>{HEALTH[u.health].label}</span>
            <span className="text-xs text-gray-500">{who(u.author)} · {new Date(u.created_at).toLocaleDateString()}</span>
            <Stats s={u.stats} />
          </div>
          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{u.summary}</p>
          {[["Highlights", u.highlights], ["Risks", u.risks], ["Next", u.next_steps]].filter(([, v]) => v).map(([label, v]) => (
            <p key={label} className="text-xs text-gray-600 mt-1 whitespace-pre-wrap"><b className="font-medium text-gray-700">{label}:</b> {v}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// Every project's health at a glance, worst first
export default function ProjectUpdates() {
  const companyId = getWorkspace();
  const [projects, setProjects] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => companyId && apiRequest(`/companies/${companyId}/updates`).then(setProjects).catch(() => setProjects([])), [companyId]);
  useEffect(() => { load(); }, [load]);
  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (!projects) return <div className="p-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>;

  const counts = Object.fromEntries(Object.keys(HEALTH).map((k) => [k, projects.filter((p) => p.latest?.health === k).length]));
  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900">Project updates</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">How each project is doing, as told by its team lead.</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(HEALTH).map(([k, h]) => (
          <span key={k} className={`text-xs px-2.5 py-1 rounded-full ${h.chip}`}>{counts[k]} {h.label.toLowerCase()}</span>
        ))}
        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{projects.filter((p) => !p.latest).length} without an update</span>
      </div>
      {projects.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg py-12 text-center text-gray-400">
          <Activity size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No projects you can see yet.</p>
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {projects.map((p) => {
          const h = p.latest && HEALTH[p.latest.health];
          const stale = p.latest && Date.now() - new Date(p.latest.created_at).getTime() > 14 * 86400000;
          return (
            <div key={p.id}>
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50">
                {open === p.id ? <ChevronDown size={14} className="mt-1 text-gray-400" /> : <ChevronRight size={14} className="mt-1 text-gray-400" />}
                <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: p.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{p.name} <span className="text-xs font-normal text-gray-400">· {p.team_name}</span></p>
                  <p className="text-xs text-gray-500 truncate">
                    {p.latest ? p.latest.summary : "No update yet"}
                    {stale && <span className="text-amber-600"> · last update over 2 weeks ago</span>}
                  </p>
                </div>
                {h && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${h.chip}`}>{h.label}</span>}
              </button>
              {open === p.id && <ProjectHistory project={p} onPosted={load} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
