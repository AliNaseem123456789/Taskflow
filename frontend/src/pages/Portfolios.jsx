import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Diamond, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useMyProjects } from "../utils/projects";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const HEALTH = {
  on_track: { label: "On track", chip: "bg-emerald-50 text-emerald-700" },
  at_risk: { label: "At risk", chip: "bg-amber-50 text-amber-700" },
  off_track: { label: "Off track", chip: "bg-rose-50 text-rose-700" },
};
const fmt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "–");

function Progress({ value }) {
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: "var(--viz-1)" }} />
    </div>
  );
}

// Create / edit form: name, description and the projects to follow
function PortfolioForm({ companyId, initial, onDone, onCancel }) {
  const projects = useMyProjects().filter((p) => p.company_id === companyId);
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [ids, setIds] = useState(new Set(initial?.projects?.map((p) => p.id) || []));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIds(next);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { name, description, project_ids: [...ids] };
    try {
      const r = initial
        ? await apiRequest(`/companies/${companyId}/portfolios/${initial.id}`, "PUT", body)
        : await apiRequest(`/companies/${companyId}/portfolios`, "POST", body);
      onDone(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <input required className={`${inputCls} w-full`} placeholder="Portfolio name, e.g. Q4 launches" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea rows={2} className={`${inputCls} w-full`} placeholder="What ties these projects together? (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1.5">Projects ({ids.size})</p>
        {projects.length === 0 && <p className="text-sm text-gray-400">No projects you can see yet.</p>}
        <div className="grid sm:grid-cols-2 gap-1 max-h-60 overflow-y-auto">
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-gray-800 px-2 py-1 rounded hover:bg-gray-50">
              <input type="checkbox" checked={ids.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-gray-400 truncate">{p.teams?.name}</span>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50">{initial ? "Save" : "Create portfolio"}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 text-sm rounded-md hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  );
}

function PortfolioList({ companyId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest(`/companies/${companyId}/portfolios`).then(setData).catch((err) => setError(err.message));
  }, [companyId]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><Briefcase size={20} /> Portfolios</h1>
          <p className="text-sm text-gray-500 mt-1">Follow several projects together — progress, health and what's coming up next.</p>
        </div>
        {data?.can_create && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 shrink-0">
            <Plus size={14} /> New portfolio
          </button>
        )}
      </div>
      {adding && <PortfolioForm companyId={companyId} onCancel={() => setAdding(false)} onDone={(p) => navigate(`/portfolios/${p.id}`)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === null && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {data?.portfolios.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-400">
          No portfolios yet.{data.can_create ? " Group related projects to see them side by side." : " Admins and managers can create them."}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {data?.portfolios.map((p) => (
          <Link key={p.id} to={`/portfolios/${p.id}`} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{p.name}</p>
              {p.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Progress value={p.progress} />
              <span className="text-xs text-gray-600 tabular-nums w-9 text-right">{p.progress}%</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span>{p.project_count} project{p.project_count === 1 ? "" : "s"}</span>
              <span className={p.at_risk ? "text-amber-700" : ""}>{p.at_risk} at risk</span>
              <span className={p.overdue ? "text-rose-600" : ""}>{p.overdue} overdue tasks</span>
              {p.owner && <span className="ml-auto">by {p.owner.name}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// One row per project with a small date bar on a shared scale
function ProjectRow({ p, range }) {
  const h = p.health && HEALTH[p.health];
  const span = range.end - range.start || 1;
  const at = (d) => ((new Date(`${d}T12:00:00`) - range.start) / span) * 100;
  const hasBar = p.start_date && p.target_date;
  const todayPct = at(new Date().toISOString().slice(0, 10));
  return (
    <div className="grid grid-cols-12 gap-3 items-center px-4 py-3">
      <div className="col-span-12 md:col-span-4 min-w-0">
        <Link to={`/team?team=${p.team_id}&tab=projects&project=${p.id}`} className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:underline">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="truncate">{p.name}</span>
        </Link>
        <p className="text-xs text-gray-400 truncate">{p.team_name}{p.archived ? " · archived" : ""}</p>
      </div>
      <div className="col-span-6 md:col-span-2 flex items-center gap-1.5">
        {h ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${h.chip}`} title={p.health_summary || ""}>{h.label}</span>
          : <span className="text-[10px] text-gray-400">No update</span>}
        {p.late && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Late</span>}
      </div>
      <div className="col-span-6 md:col-span-2">
        <div className="flex items-center gap-2"><Progress value={p.progress} /><span className="text-xs tabular-nums text-gray-600">{p.progress}%</span></div>
        <p className="text-[11px] text-gray-400 mt-0.5">{p.done}/{p.total} done{p.overdue ? <span className="text-rose-600"> · {p.overdue} overdue</span> : ""}</p>
      </div>
      <div className="col-span-12 md:col-span-4">
        {range.ok ? (
          <div className="relative h-5 bg-gray-50 rounded">
            {hasBar && (
              <div className="absolute top-1 bottom-1 rounded" title={`${fmt(p.start_date)} → ${fmt(p.target_date)}`}
                style={{ left: `${at(p.start_date)}%`, width: `${Math.max(1, at(p.target_date) - at(p.start_date))}%`, backgroundColor: p.late ? "var(--viz-2)" : "var(--viz-1)", opacity: 0.85 }} />
            )}
            {!hasBar && p.target_date && <div className="absolute top-0 bottom-0 w-0.5 bg-gray-500" style={{ left: `${at(p.target_date)}%` }} title={`Target ${fmt(p.target_date)}`} />}
            {p.next_milestone && (
              <Diamond size={10} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-gray-900 fill-current" style={{ left: `${at(p.next_milestone.date)}%` }} />
            )}
            {todayPct >= 0 && todayPct <= 100 && <div className="absolute -top-0.5 -bottom-0.5 w-px bg-rose-500" style={{ left: `${todayPct}%` }} />}
          </div>
        ) : null}
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
          {p.next_milestone ? <>Next: {p.next_milestone.name} · {fmt(p.next_milestone.date)}</> : p.target_date ? `Target ${fmt(p.target_date)}` : "No dates set"}
        </p>
      </div>
    </div>
  );
}

function PortfolioDetail({ companyId, id }) {
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    apiRequest(`/companies/${companyId}/portfolios/${id}`).then(setP).catch((err) => setError(err.message));
  }, [companyId, id]);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!window.confirm(`Delete the portfolio "${p.name}"? The projects themselves stay.`)) return;
    await apiRequest(`/companies/${companyId}/portfolios/${id}`, "DELETE").catch((err) => setError(err.message));
    navigate("/portfolios");
  };

  if (error && !p) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!p) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  // shared date scale across all projects
  const dates = p.projects.flatMap((x) => [x.start_date, x.target_date, x.next_milestone?.date]).filter(Boolean)
    .concat(new Date().toISOString().slice(0, 10)).map((d) => new Date(`${d}T12:00:00`).getTime());
  const range = { start: Math.min(...dates) - 7 * 864e5, end: Math.max(...dates) + 7 * 864e5, ok: dates.length > 1 };
  const total = p.projects.length;
  const avg = total ? Math.round(p.projects.reduce((s, x) => s + x.progress, 0) / total) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-5">
      <Link to="/portfolios" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> All portfolios</Link>
      {editing ? (
        <PortfolioForm companyId={companyId} initial={p} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); load(); }} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{p.name}</h1>
            {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
          </div>
          {p.can_edit && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50"><Pencil size={12} /> Edit</button>
              <button onClick={remove} className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs rounded-md text-rose-600 hover:bg-rose-50"><Trash2 size={12} /> Delete</button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Projects", total],
          ["Average progress", `${avg}%`],
          ["At risk / off track", p.projects.filter((x) => x.health && x.health !== "on_track").length],
          ["Overdue tasks", p.projects.reduce((s, x) => s + x.overdue, 0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {total === 0 && <p className="p-8 text-center text-sm text-gray-400">No projects in this portfolio{p.can_edit ? " — use Edit to add some." : "."}</p>}
        {p.projects.map((x) => <ProjectRow key={x.id} p={x} range={range} />)}
      </div>
      {p.hidden_projects > 0 && (
        <p className="text-xs text-gray-400">{p.hidden_projects} more project{p.hidden_projects === 1 ? " is" : "s are"} in this portfolio but not visible to you.</p>
      )}
    </div>
  );
}

export default function Portfolios() {
  const { id } = useParams();
  const companyId = getWorkspace();
  if (!companyId) return <Navigate to="/dashboard" replace />;
  return id ? <PortfolioDetail companyId={companyId} id={id} /> : <PortfolioList companyId={companyId} />;
}
