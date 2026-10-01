import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowLeft, FolderKanban, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { useLiveEvent } from "../../utils/live";
import { refreshMyProjects } from "../../utils/projects";
import { STATUS_BADGE } from "../../utils/taskMeta";
import TaskMeta from "../TaskMeta";
import { useCompanyPeople } from "../../utils/companyPeople";
import { ROLE_LABELS } from "../../utils/workspace";
import ProjectBoard from "./ProjectBoard";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#6b7280"];

// People added to one project on top of its team (guests, people from other teams)
function ProjectPeople({ team, project }) {
  const isAdmin = team.role === "admin";
  const { members } = useCompanyPeople();
  const [people, setPeople] = useState([]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const base = `/teams/${team.id}/projects/${project.id}/members`;

  const load = useCallback(() => apiRequest(base).then(setPeople).catch(() => {}), [base]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setError("");
    try {
      await fn();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isAdmin && people.length === 0) return null;
  const roleOf = (id) => members.find((m) => m.id === id)?.role;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <p className="text-xs font-medium text-gray-500 mb-2">Also on this project <span className="text-gray-400 font-normal">(besides the {team.name} team)</span></p>
      {people.length === 0 && <p className="text-xs text-gray-400 mb-2">Nobody extra yet. Add someone from another team, or invite a guest from Company → Invites.</p>}
      <div className="flex flex-wrap gap-2 mb-2">
        {people.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 text-xs pl-2.5 pr-1.5 py-1 rounded-full bg-gray-100 text-gray-700">
            {p.name || p.email}
            {roleOf(p.id) === "guest" && <span className="text-[10px] text-amber-700">{ROLE_LABELS.guest}</span>}
            {isAdmin && (
              <button className="text-gray-400 hover:text-rose-500" aria-label={`Remove ${p.name || p.email}`}
                onClick={() => run(() => apiRequest(`${base}/${p.id}`, "DELETE"))}>×</button>
            )}
          </span>
        ))}
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <select className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white flex-1 max-w-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add someone from the company…</option>
            {members.filter((m) => !people.some((p) => p.id === m.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.email} ({ROLE_LABELS[m.role]})</option>
            ))}
          </select>
          <button disabled={!pick} className="px-2.5 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50 disabled:opacity-40"
            onClick={() => run(async () => { await apiRequest(base, "POST", { user_id: pick }); setPick(""); })}>
            Add
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function ProjectTasks({ team, project, onBack }) {
  const [view, setView] = useState("board");
  const [tasks, setTasks] = useState(null);
  const load = useCallback(
    () => apiRequest(`/teams/${team.id}/projects/${project.id}/tasks`).then(setTasks).catch(() => setTasks([])),
    [team.id, project.id]
  );
  useEffect(() => { load(); }, [load]);
  useLiveEvent("task", load);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={14} /> All projects
      </button>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
        <h2 className="text-base font-semibold text-gray-900">{project.name}</h2>
      </div>
      {project.description && <p className="text-sm text-gray-500 mb-4">{project.description}</p>}
      <ProjectPeople team={team} project={project} />
      <div className="flex gap-1 mb-3">
        {[["board", "Board"], ["list", "List"]].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-3 py-1 text-xs rounded-md ${view === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>
      {view === "board" ? <ProjectBoard team={team} project={project} /> : (
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
        {tasks === null && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {tasks?.length === 0 && <p className="p-8 text-center text-sm text-gray-400">No tasks yet. Pick this project when adding or editing a task.</p>}
        {tasks?.map((t) => (
          <Link key={t.id} to={`/tasks/${t.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50">
            <div className="min-w-0">
              <p className={`text-sm text-gray-900 ${t.status === "Done" ? "line-through text-gray-400" : ""}`}>{t.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t.owner?.name || t.owner?.email} · {t.date_logged}</p>
              <TaskMeta task={t} />
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[t.status]}`}>{t.status}</span>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}

// Team projects: list with progress; admins create/archive/delete
export default function ProjectsTab({ team }) {
  const isAdmin = team.role === "admin";
  const [projects, setProjects] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0] });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    () => apiRequest(`/teams/${team.id}/projects`).then(setProjects).catch(() => setProjects([])),
    [team.id]
  );
  useEffect(() => { load(); setOpen(null); }, [load]);
  useLiveEvent(["project", "task"], load);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await apiRequest(`/teams/${team.id}/projects`, "POST", form);
      setForm({ name: "", description: "", color: COLORS[0] });
      setAdding(false);
      refreshMyProjects();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setArchived = async (p, archived) => {
    await apiRequest(`/teams/${team.id}/projects/${p.id}`, "PUT", { archived }).catch(() => {});
    load();
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? Its tasks stay, they just won't be in a project.`)) return;
    await apiRequest(`/teams/${team.id}/projects/${p.id}`, "DELETE").catch(() => {});
    load();
  };

  if (open) return <ProjectTasks team={team} project={open} onBack={() => setOpen(null)} />;

  return (
    <div>
      {isAdmin && (
        <div className="mb-4">
          {adding ? (
            <form onSubmit={create} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Project name" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none bg-white" />
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description (optional)" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none bg-white" />
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full ${form.color === c ? "ring-2 ring-offset-2 ring-gray-900" : ""}`}
                    style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md">Create project</button>
                <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 bg-white">
              <Plus size={14} /> New project
            </button>
          )}
        </div>
      )}

      {projects === null && <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />}
      {projects?.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg py-12 text-center text-gray-400">
          <FolderKanban size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No projects yet{isAdmin ? "" : " — an admin can create one"}.</p>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {projects?.map((p) => {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <div key={p.id} className={`bg-white border border-gray-200 rounded-lg p-4 group ${p.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setOpen(p)} className="flex items-center gap-2 text-left min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-semibold text-gray-900 truncate hover:underline">{p.name}</span>
                  {p.archived && <span className="text-[10px] text-gray-400">archived</span>}
                </button>
                {isAdmin && (
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setArchived(p, !p.archived)} className="p-1 text-gray-300 hover:text-gray-600" title={p.archived ? "Restore" : "Archive"}>
                      {p.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    </button>
                    <button onClick={() => remove(p)} className="p-1 text-gray-300 hover:text-rose-500" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </span>
                )}
              </div>
              {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
              <div className="flex items-center justify-between text-xs text-gray-500 mt-3 mb-1">
                <span>{p.done}/{p.total} done</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
