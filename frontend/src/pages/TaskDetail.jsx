import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Link2, ListChecks, Lock, Plus, Search, X } from "lucide-react";
import TaskList from "../components/TaskList";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";
import { STATUS_BADGE } from "../utils/taskMeta";
import { aiRequest, useAI } from "../utils/ai";
import { localDate, shiftDate } from "../utils/date";
import { Sparkles } from "lucide-react";
import TaskTime from "../components/TaskTime";
import TaskFields from "../components/TaskFields";
import TaskApprovals from "../components/TaskApprovals";

// AI suggests subtasks (with owners) and checklist items; you tick what to keep
function Breakdown({ task, opts, onAdded }) {
  const [state, setState] = useState({ loading: false, data: null, error: "" });
  const [keep, setKeep] = useState({});
  const ask = async () => {
    setState({ loading: true, data: null, error: "" });
    try {
      const data = await aiRequest("/api/tasks/breakdown", { task_id: task.id }, { company: task.company_id || "" });
      const all = {};
      data.subtasks.forEach((_, i) => (all[`s${i}`] = true));
      data.checklist.forEach((_, i) => (all[`c${i}`] = true));
      setKeep(all);
      setState({ loading: false, data, error: "" });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message });
    }
  };
  const add = async () => {
    const { data } = state;
    setState({ ...state, loading: true });
    for (const [i, sub] of data.subtasks.entries()) {
      if (!keep[`s${i}`]) continue;
      await apiRequest("/tasks", "POST", {
        title: sub.title, parent_task_id: task.id, status: "Doing",
        ...(sub.assignee_id ? { assignee_id: sub.assignee_id } : task.assignee_id ? { assignee_id: task.assignee_id } : {}),
        ...(sub.days_from_now !== null ? { due_date: shiftDate(localDate(), sub.days_from_now) } : {}),
      }, opts).catch(() => {});
    }
    for (const [i, text] of data.checklist.entries())
      if (keep[`c${i}`]) await apiRequest(`/tasks/${task.id}/checklist`, "POST", { title: text }, opts).catch(() => {});
    setState({ loading: false, data: null, error: "" });
    onAdded();
  };
  if (!state.data)
    return (
      <div className="mt-2">
        <button onClick={ask} disabled={state.loading} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50">
          <Sparkles size={12} /> {state.loading ? "Thinking…" : "Break it down with AI"}
        </button>
        {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
      </div>
    );
  const row = (key, label, sub) => (
    <label key={key} className="flex items-start gap-2 text-sm text-gray-800">
      <input type="checkbox" className="mt-1" checked={!!keep[key]} onChange={() => setKeep({ ...keep, [key]: !keep[key] })} />
      <span>{label}{sub && <span className="text-xs text-gray-400"> · {sub}</span>}</span>
    </label>
  );
  return (
    <div className="mt-3 border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
      <p className="text-xs font-medium text-gray-600 flex items-center gap-1"><Sparkles size={12} /> Suggested</p>
      {state.data.subtasks.map((s, i) => row(`s${i}`, s.title,
        [s.assignee_name, s.days_from_now !== null && `due in ${s.days_from_now} day${s.days_from_now === 1 ? "" : "s"}`].filter(Boolean).join(" · ")))}
      {state.data.checklist.length > 0 && <p className="text-xs text-gray-500 pt-1">Checklist</p>}
      {state.data.checklist.map((c, i) => row(`c${i}`, c))}
      {state.data.notes && <p className="text-xs text-gray-500 italic">{state.data.notes}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={add} disabled={state.loading} className="px-3 py-1.5 btn-accent text-xs rounded-md disabled:opacity-50">Add selected</button>
        <button onClick={() => setState({ loading: false, data: null, error: "" })} className="px-3 py-1.5 text-xs text-gray-500">Dismiss</button>
      </div>
    </div>
  );
}

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const who = (u) => u?.name || u?.email;

function Section({ icon: Icon, title, extra, children }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-gray-400" />
        <h2 className="font-display text-[17px] font-bold text-gray-900 flex-1">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

// A linked task (subtask, blocker) as one line
function TaskLine({ t, onToggle, onRemove }) {
  return (
    <div className="flex items-center gap-2 py-1 group">
      {onToggle ? (
        <input type="checkbox" checked={t.status === "Done"} onChange={() => onToggle(t)} aria-label={`Mark ${t.title} done`} />
      ) : (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>{t.status}</span>
      )}
      <Link to={`/tasks/${t.id}`} className={`text-sm flex-1 hover:underline ${t.status === "Done" ? "line-through text-gray-400" : "text-gray-800"}`}>
        {t.title}
      </Link>
      {t.assignee && <span className="text-xs text-gray-400">{who(t.assignee)}</span>}
      {onRemove && (
        <button onClick={() => onRemove(t)} className="p-0.5 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100" aria-label="Remove link">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// Search the same workspace for a task to wait on
function BlockerPicker({ task, onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const id = setTimeout(() => {
      apiRequest(`/tasks/search?q=${encodeURIComponent(q.trim())}`, "GET", null,
        task.company_id ? { company: task.company_id } : { personal: true })
        .then((rows) => setResults(rows.filter((r) => r.id !== task.id).slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, task.id, task.company_id]);
  return (
    <div className="relative mt-2">
      <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
      <input className={`${inputCls} w-full pl-8 py-1.5`} placeholder="Waits for… (search a task)" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button key={r.id} onClick={() => { onPick(r); setQ(""); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              {r.title} <span className="text-xs text-gray-400">· {r.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One task: its details, subtasks, checklist, what it waits for, watchers and comments.
export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [newSub, setNewSub] = useState("");
  const [newItem, setNewItem] = useState("");
  const ai = useAI();

  const load = useCallback(
    () => apiRequest(`/tasks/${id}`).then(setTask).catch((err) => setError(err.message)),
    [id]
  );
  useEffect(() => {
    setTask(null);
    setError("");
    load();
  }, [load]);

  // act in the task's own workspace, wherever it was opened from
  const opts = task?.company_id ? { company: task.company_id } : { personal: true };
  const run = async (fn) => {
    setActionError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const perms = task?.permissions || {};
  const canEdit = perms.canEdit;

  const changeStatus = (taskId, status) => run(() => apiRequest(`/tasks/${taskId}`, "PUT", { status }, opts));
  const remove = async (taskId) => {
    await apiRequest(`/tasks/${taskId}`, "DELETE", null, opts).catch(() => {});
    navigate("/mydones");
  };

  if (error) return <p className="p-8 text-sm text-gray-500">{error}</p>;
  if (!task)
    return (
      <div className="p-8">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );

  const column = task.project_statuses.find((s) => s.id === task.status_id);
  const checklistDone = task.checklist.filter((i) => i.done).length;
  const openBlockers = task.blocked_by.filter((b) => b.status !== "Done").length + (task.hidden_open_blockers || 0);

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft size={14} /> Back
      </button>

      <div>
        <p className="text-xs text-gray-400">
          {[task.company?.name || "Personal", task.project?.name].filter(Boolean).join(" · ")}
          {task.parent && (
            <> · part of <Link to={`/tasks/${task.parent.id}`} className="underline hover:text-gray-700">{task.parent.title}</Link></>
          )}
        </p>
        {task.description && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{task.description}</p>}
      </div>

      {openBlockers > 0 && task.status !== "Done" && (
        <p className="flex items-center gap-1.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <Lock size={14} /> Waiting on {openBlockers} {openBlockers === 1 ? "task" : "tasks"} to finish first.
        </p>
      )}

      {/* people + column */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {task.company_id && (
          <>
            <p><span className="text-gray-400">Assigned to</span> <span className="text-gray-900">{who(task.assignee) || "—"}</span></p>
            <p><span className="text-gray-400">Reviewer</span> <span className="text-gray-900">{who(task.reviewer) || "—"}</span></p>
          </>
        )}
        <p><span className="text-gray-400">Created by</span> <span className="text-gray-900">{who(task.creator)}</span> · {task.date_logged}</p>
        {task.started_at && (
          <p>
            <span className="text-gray-400">Started</span> {new Date(task.started_at).toLocaleDateString()}
            {task.completed_at && <> · <span className="text-gray-400">finished</span> {new Date(task.completed_at).toLocaleDateString()}</>}
          </p>
        )}
        {task.project_statuses.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="text-gray-400">Column</span>
            <select className={`${inputCls} py-1 text-xs`} value={task.status_id || ""} disabled={!canEdit}
              onChange={(e) => run(() => apiRequest(`/tasks/${task.id}`, "PUT", { status_id: e.target.value }, opts))}>
              {!column && <option value="">{task.status}</option>}
              {task.project_statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-400">Watching</span>
          <span className="text-gray-900">{task.watchers.length ? task.watchers.map(who).join(", ") : "nobody"}</span>
          <button className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-md hover:bg-gray-50"
            onClick={() => run(() => task.watching
              ? apiRequest(`/tasks/${task.id}/watchers/${getStoredUser()?.id}`, "DELETE", null, opts)
              : apiRequest(`/tasks/${task.id}/watchers`, "POST", {}, opts))}>
            {task.watching ? <><EyeOff size={12} /> Stop watching</> : <><Eye size={12} /> Watch</>}
          </button>
        </div>
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {/* the task row itself: status, edit, comments */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <TaskList
          tasks={[task]}
          showComments
          onStatusChange={canEdit ? changeStatus : undefined}
          onDelete={perms.canDelete ? remove : undefined}
          onUpdate={canEdit ? () => load() : undefined}
        />
      </div>

      {!task.parent_task_id && (
        <Section icon={ListChecks} title={`Subtasks${task.subtasks.length ? ` · ${task.subtasks.filter((s) => s.status === "Done").length}/${task.subtasks.length}` : ""}`}>
          {task.subtasks.length === 0 && <p className="text-xs text-gray-400">Break this into smaller pieces, each with its own owner.</p>}
          {task.subtasks.map((s) => (
            <TaskLine key={s.id} t={s} onToggle={(t) => changeStatus(t.id, t.status === "Done" ? "Doing" : "Done")} />
          ))}
          {perms.canComment && (
            <form className="flex gap-2 mt-2" onSubmit={(e) => {
              e.preventDefault();
              if (!newSub.trim()) return;
              run(async () => {
                await apiRequest("/tasks", "POST", { title: newSub, parent_task_id: task.id, assignee_id: task.assignee_id || undefined }, opts);
                setNewSub("");
              });
            }}>
              <input className={`${inputCls} flex-1 py-1.5`} placeholder="Add a subtask" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
              <button className="px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50" aria-label="Add subtask"><Plus size={14} /></button>
            </form>
          )}
          {ai.on && perms.canComment && <Breakdown task={task} opts={opts} onAdded={load} />}
        </Section>
      )}

      {task.project_id && <TaskFields task={task} opts={opts} />}

      {task.company_id && <TaskApprovals task={task} opts={opts} />}

      <TaskTime task={task} opts={opts} canLog={perms.canComment} />

      <Section icon={ListChecks} title="Checklist"
        extra={task.checklist.length > 0 && <span className="text-xs text-gray-400">{checklistDone}/{task.checklist.length}</span>}>
        {task.checklist.length > 0 && (
          <div className="h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(checklistDone / task.checklist.length) * 100}%` }} />
          </div>
        )}
        {task.checklist.map((i) => (
          <div key={i.id} className="flex items-center gap-2 py-1 group">
            <input type="checkbox" checked={i.done} disabled={!canEdit} aria-label={i.title}
              onChange={() => run(() => apiRequest(`/tasks/${task.id}/checklist/${i.id}`, "PUT", { done: !i.done }, opts))} />
            <span className={`text-sm flex-1 ${i.done ? "line-through text-gray-400" : "text-gray-800"}`}>{i.title}</span>
            {canEdit && (
              <button className="p-0.5 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100" aria-label="Delete item"
                onClick={() => run(() => apiRequest(`/tasks/${task.id}/checklist/${i.id}`, "DELETE", null, opts))}>
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <form className="flex gap-2 mt-2" onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            run(async () => {
              await apiRequest(`/tasks/${task.id}/checklist`, "POST", { title: newItem }, opts);
              setNewItem("");
            });
          }}>
            <input className={`${inputCls} flex-1 py-1.5`} placeholder="Add an item" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <button className="px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50" aria-label="Add item"><Plus size={14} /></button>
          </form>
        )}
      </Section>

      <Section icon={Link2} title="Waits for">
        {task.blocked_by.length === 0 && !task.hidden_open_blockers && <p className="text-xs text-gray-400">Nothing. Link tasks that must finish before this one can.</p>}
        {task.blocked_by.map((b) => (
          <TaskLine key={b.id} t={b} onRemove={canEdit ? () => run(() => apiRequest(`/tasks/${task.id}/dependencies/${b.id}`, "DELETE", null, opts)) : undefined} />
        ))}
        {task.hidden_open_blockers > 0 && <p className="text-xs text-gray-400">+ {task.hidden_open_blockers} task(s) you can't see</p>}
        {canEdit && <BlockerPicker task={task} onPick={(b) => run(() => apiRequest(`/tasks/${task.id}/dependencies`, "POST", { blocked_by_id: b.id }, opts))} />}
        {task.blocking.length > 0 && (
          <>
            <p className="text-xs font-medium text-gray-500 mt-3 mb-1">Holding up</p>
            {task.blocking.map((b) => <TaskLine key={b.id} t={b} />)}
          </>
        )}
      </Section>
    </div>
  );
}
