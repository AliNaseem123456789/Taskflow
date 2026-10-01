import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { Flag, Play, Plus, Square, Trash2 } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { useLiveEvent } from "../../utils/live";
import { STATUS_BADGE } from "../../utils/taskMeta";
import { fmtMinutes } from "../../utils/timer";

const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const axis = { tick: { fill: "var(--viz-axis)", fontSize: 11 }, axisLine: false, tickLine: false };
const unitShort = (u) => (u === "hours" ? "h" : "pt");

// Small inline estimate editor
function Estimate({ task, unit, onSaved }) {
  const [v, setV] = useState(task.estimate ?? "");
  useEffect(() => setV(task.estimate ?? ""), [task.estimate]);
  return (
    <input type="number" min="0" step="0.5" value={v} aria-label={`Estimate for ${task.title}`} placeholder="–"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => String(v) !== String(task.estimate ?? "") &&
        apiRequest(`/tasks/${task.id}`, "PUT", { estimate: v === "" ? null : Number(v) }).then(onSaved).catch(() => setV(task.estimate ?? ""))}
      className="w-14 text-xs px-1.5 py-1 border border-gray-200 rounded text-right bg-white" title={`Estimate (${unit})`} />
  );
}

function TaskRow({ t, unit, onSaved, action }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {action}
      <Link to={`/tasks/${t.id}`} className={`text-sm flex-1 min-w-0 truncate hover:underline ${t.status === "Done" ? "line-through text-gray-400" : "text-gray-800"}`}>{t.title}</Link>
      {t.assignee && <span className="text-xs text-gray-400 hidden sm:inline">{t.assignee.name || t.assignee.email}</span>}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>{t.status}</span>
      <Estimate task={t} unit={unit} onSaved={onSaved} />
    </div>
  );
}

function Burndown({ data, unit }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="day" tickFormatter={fmt} {...axis} minTickGap={20} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip formatter={(v, n) => [`${v} ${unit}`, n]} labelFormatter={fmt}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--color-gray-200, #e5e7eb)" }} />
          <Line dataKey="ideal" name="Ideal" stroke="var(--viz-axis)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
          <Line dataKey="remaining" name="Remaining" stroke="var(--viz-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sprints for one team: the running sprint, what's planned next, the backlog, and velocity
export default function SprintsTab({ team }) {
  const [list, setList] = useState(null);
  const [current, setCurrent] = useState(null);
  const [planned, setPlanned] = useState({});
  const [backlog, setBacklog] = useState([]);
  const [velocity, setVelocity] = useState(null);
  const [picked, setPicked] = useState({});
  const [target, setTarget] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const base = `/teams/${team.id}`;

  const load = useCallback(async () => {
    try {
      const l = await apiRequest(`${base}/sprints`);
      setList(l);
      const active = l.sprints.find((s) => s.status === "active");
      setCurrent(active ? await apiRequest(`${base}/sprints/${active.id}`) : null);
      const next = {};
      for (const s of l.sprints.filter((x) => x.status === "planned")) next[s.id] = await apiRequest(`${base}/sprints/${s.id}`);
      setPlanned(next);
      setBacklog(await apiRequest(`${base}/backlog`));
      setVelocity(await apiRequest(`${base}/velocity`));
    } catch (err) {
      setError(err.message);
    }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  useLiveEvent(["sprint", "task"], load);

  const run = async (fn) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!list) return error ? <p className="text-sm text-gray-500">{error}</p> : <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;
  const unit = list.team.estimate_unit;
  const u = unitShort(unit);
  const lead = list.can_manage;
  const plannedList = list.sprints.filter((s) => s.status === "planned").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const closed = list.sprints.filter((s) => s.status === "closed");
  const into = target || plannedList[0]?.id || current?.sprint.id || "";
  const chosen = Object.keys(picked).filter((k) => picked[k]).map(Number);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {lead && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <button onClick={() => run(() => apiRequest(`${base}/sprints`, "POST", {}))}
            className="flex items-center gap-1 px-3 py-1.5 btn-accent rounded-md text-sm"><Plus size={14} /> New sprint</button>
          <label className="flex items-center gap-1">Estimate in
            <select className="border border-gray-200 rounded px-1.5 py-1 bg-white" value={unit}
              onChange={(e) => run(() => apiRequest(`${base}/sprint-settings`, "PUT", { estimate_unit: e.target.value }))}>
              <option value="points">story points</option><option value="hours">hours</option>
            </select>
          </label>
          <label className="flex items-center gap-1">Sprints last
            <select className="border border-gray-200 rounded px-1.5 py-1 bg-white" value={list.team.sprint_length_days}
              onChange={(e) => run(() => apiRequest(`${base}/sprint-settings`, "PUT", { sprint_length_days: Number(e.target.value) }))}>
              {[7, 14, 21, 28].map((d) => <option key={d} value={d}>{d / 7} week{d > 7 ? "s" : ""}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* running sprint */}
      {current ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-emerald-700 font-medium">Running · {current.days_left} day{current.days_left === 1 ? "" : "s"} left</p>
              <h3 className="text-base font-semibold text-gray-900">{current.sprint.name}</h3>
              <p className="text-xs text-gray-500">{fmt(current.sprint.start_date)} – {fmt(current.sprint.end_date)}{current.sprint.goal && <> · Goal: {current.sprint.goal}</>}</p>
            </div>
            {lead && !closing && (
              <button onClick={() => setClosing(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50"><Square size={12} /> Close sprint</button>
            )}
          </div>
          {closing && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-3 text-sm space-y-2">
              <p className="text-gray-700">{current.task_count - current.done_count} unfinished task(s). Where should they go?</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => run(async () => { await apiRequest(`${base}/sprints/${current.sprint.id}/close`, "POST", { carry_to: "next" }); setClosing(false); })}
                  className="px-3 py-1.5 btn-accent text-xs rounded-md">Move to the next sprint</button>
                <button onClick={() => run(async () => { await apiRequest(`${base}/sprints/${current.sprint.id}/close`, "POST", { carry_to: "backlog" }); setClosing(false); })}
                  className="px-3 py-1.5 border border-gray-200 text-xs rounded-md bg-white">Back to the backlog</button>
                <button onClick={() => setClosing(false)} className="px-3 py-1.5 text-xs text-gray-500">Cancel</button>
              </div>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${current.total ? (current.done / current.total) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-gray-600">{current.done} / {current.total} {u} · {current.done_count}/{current.task_count} tasks</span>
          </div>
          {current.unestimated > 0 && <p className="text-[11px] text-amber-700 mt-1">{current.unestimated} task(s) have no estimate.</p>}
          {current.time_minutes > 0 && (
            <p className="text-[11px] text-gray-500 mt-1">
              Time logged: <b className="font-medium text-gray-800">{fmtMinutes(current.time_minutes)}</b>
              {unit === "hours" && current.total > 0 && <> of {current.total}h estimated ({Math.round((current.time_minutes / 60 / current.total) * 100)}%)</>}
            </p>
          )}
          <div className="grid lg:grid-cols-2 gap-5 mt-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Burndown ({unit})</p>
              <Burndown data={current.burndown} unit={u} />
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {current.tasks.map((t) => (
                <TaskRow key={t.id} t={t} unit={unit} onSaved={load}
                  action={lead && <button title="Back to backlog" onClick={() => run(() => apiRequest(`${base}/sprints/${current.sprint.id}/tasks`, "PUT", { remove: [t.id] }))}
                    className="text-gray-300 hover:text-gray-600 text-xs">↩</button>} />
              ))}
              {current.tasks.length === 0 && <p className="text-xs text-gray-400 py-2">No tasks in this sprint.</p>}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 flex items-center gap-1.5"><Flag size={14} /> No sprint running.{lead ? " Plan one below and start it." : ""}</p>
      )}

      {/* planned sprints */}
      {plannedList.map((s) => {
        const d = planned[s.id];
        return (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs text-gray-500">Planned · {fmt(s.start_date)} – {fmt(s.end_date)}</p>
                {lead ? (
                  <input className="text-sm font-semibold text-gray-900 bg-transparent outline-none border-b border-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                    defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(() => apiRequest(`${base}/sprints/${s.id}`, "PUT", { name: e.target.value }))} />
                ) : <p className="text-sm font-semibold text-gray-900">{s.name}</p>}
              </div>
              <span className="text-xs text-gray-600">{s.total} {u} · {s.task_count} tasks</span>
              {velocity?.average && s.total > velocity.average * 1.2 && (
                <span className="text-[11px] text-amber-700">more than your usual {velocity.average} {u}</span>
              )}
              {lead && !current && (
                <button onClick={() => run(() => apiRequest(`${base}/sprints/${s.id}/start`, "POST"))}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 btn-accent rounded-md"><Play size={12} /> Start</button>
              )}
              {lead && (
                <button title="Delete sprint" onClick={() => window.confirm(`Delete ${s.name}? Its tasks go back to the backlog.`) && run(() => apiRequest(`${base}/sprints/${s.id}`, "DELETE"))}
                  className="p-1 text-gray-300 hover:text-rose-500"><Trash2 size={14} /></button>
              )}
            </div>
            {lead && (
              <input className="mt-1 w-full text-xs text-gray-600 bg-transparent outline-none border-b border-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15" placeholder="Sprint goal (optional)"
                defaultValue={s.goal || ""} onBlur={(e) => e.target.value !== (s.goal || "") && run(() => apiRequest(`${base}/sprints/${s.id}`, "PUT", { goal: e.target.value }))} />
            )}
            <div className="mt-2 divide-y divide-gray-50">
              {d?.tasks.map((t) => (
                <TaskRow key={t.id} t={t} unit={unit} onSaved={load}
                  action={lead && <button title="Back to backlog" onClick={() => run(() => apiRequest(`${base}/sprints/${s.id}/tasks`, "PUT", { remove: [t.id] }))}
                    className="text-gray-300 hover:text-gray-600 text-xs">↩</button>} />
              ))}
              {d && d.tasks.length === 0 && <p className="text-xs text-gray-400 py-1">Pick tasks from the backlog below.</p>}
            </div>
          </div>
        );
      })}

      {/* backlog */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Backlog <span className="font-normal text-gray-400">· {backlog.length} open · {backlog.reduce((s, t) => s + (Number(t.estimate) || 0), 0)} {u}</span></h3>
          {lead && (plannedList.length > 0 || current) && (
            <>
              <select className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white" value={into} onChange={(e) => setTarget(e.target.value)}>
                {current && <option value={current.sprint.id}>{current.sprint.name} (running)</option>}
                {plannedList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button disabled={!chosen.length} onClick={() => run(async () => { await apiRequest(`${base}/sprints/${into}/tasks`, "PUT", { add: chosen }); setPicked({}); })}
                className="text-xs px-3 py-1.5 btn-accent rounded-md disabled:opacity-40">Add {chosen.length || ""} to sprint</button>
            </>
          )}
        </div>
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {backlog.map((t) => (
            <TaskRow key={t.id} t={t} unit={unit} onSaved={load}
              action={lead && <input type="checkbox" checked={!!picked[t.id]} onChange={() => setPicked({ ...picked, [t.id]: !picked[t.id] })} aria-label={`Pick ${t.title}`} />} />
          ))}
          {backlog.length === 0 && <p className="text-xs text-gray-400 py-2">The backlog is empty — every open task is planned.</p>}
        </div>
      </div>

      {/* velocity */}
      {velocity?.sprints.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Velocity</h3>
            <div className="flex gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--viz-axis)" }} /> Planned</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--viz-1)" }} /> Finished</span>
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocity.sprints.map((s) => ({ name: s.name, committed: Number(s.committed) || 0, completed: Number(s.completed) || 0 }))}
                barGap={2} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip formatter={(v, n) => [`${v} ${u}`, n]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="committed" name="Planned" fill="var(--viz-axis)" radius={[4, 4, 0, 0]} barSize={22} />
                <Bar dataKey="completed" name="Finished" fill="var(--viz-1)" radius={[4, 4, 0, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {velocity.average !== null && <p className="text-xs text-gray-500 mt-1">Average of the last 3 sprints: <b>{velocity.average} {u}</b> — a good size for the next one.</p>}
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Past sprints</p>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
            {closed.map((s) => (
              <div key={s.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 text-gray-800">{s.name}</span>
                <span className="text-xs text-gray-500">{fmt(s.start_date)} – {fmt(s.end_date)}</span>
                <span className="text-xs text-gray-700">{Number(s.completed) || 0}/{Number(s.committed) || 0} {u}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
