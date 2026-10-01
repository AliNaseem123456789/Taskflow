import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronLeft, ChevronRight, Download, Play, Square, Timer, X } from "lucide-react";
import api, { getWorkspace } from "../api/api";
import { apiRequest } from "../utils/api";
import { localDate, parseLocalDate, shiftDate } from "../utils/date";
import { fmtClock, fmtMinutes, onTimerChange, parseDuration, useTimer } from "../utils/timer";
import { useCompanyPeople } from "../utils/companyPeople";
import { useMyProjects } from "../utils/projects";
import AreaTile from "../components/AreaTile";
import StatCard from "../components/ui/StatCard";
import { ClockCountdown, CurrencyCircleDollar, ListBullets } from "@phosphor-icons/react";

const inputCls = "text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mondayOf = (d) => shiftDate(d, -((parseLocalDate(d).getDay() + 6) % 7));
const short = (d) => parseLocalDate(d).toLocaleDateString([], { month: "short", day: "numeric" });
const axisProps = { tick: { fill: "var(--viz-axis)", fontSize: 11 }, axisLine: false, tickLine: false };

// Open tasks you can log time on (current workspace)
function useOpenTasks() {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    apiRequest("/tasks?open=1&top=1").then((t) => setTasks(t || [])).catch(() => setTasks([]));
  }, []);
  return tasks;
}

function TaskPicker({ tasks, value, onChange, label = "Task" }) {
  return (
    <select className={`${inputCls} min-w-0 max-w-64`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">No task</option>
      {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.projects?.name ? ` · ${t.projects.name}` : ""}</option>)}
    </select>
  );
}

// ── My week ──────────────────────────────────────────────────────────────────
function MyWeek() {
  const { running, now, start, stop } = useTimer();
  const tasks = useOpenTasks();
  const [monday, setMonday] = useState(() => mondayOf(localDate()));
  const [data, setData] = useState(null);
  const [timerTask, setTimerTask] = useState("");
  const [form, setForm] = useState({ task: "", date: localDate(), duration: "", note: "", billable: false });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const days = useMemo(() => DAY_NAMES.map((_, i) => shiftDate(monday, i)), [monday]);
  const inCompany = !!getWorkspace();

  const load = useCallback(
    () => apiRequest(`/time/entries?from=${days[0]}&to=${days[6]}`).then(setData).catch((err) => setError(err.message)),
    [days]
  );
  useEffect(() => { load(); }, [load]);
  useEffect(() => onTimerChange(load), [load]);

  const act = async (fn) => {
    setError("");
    try { await fn(); await load(); } catch (err) { setError(err.message); }
  };

  const add = (e) => {
    e.preventDefault();
    const minutes = parseDuration(form.duration);
    if (!minutes) return setError("Write the time like 1:30, 1h 30m, 90m or 1.5");
    act(async () => {
      await apiRequest("/time/entries", "POST", { task_id: form.task || null, work_date: form.date, minutes, note: form.note, billable: form.billable });
      setForm({ ...form, duration: "", note: "" });
    });
  };

  const saveEdit = () => {
    const minutes = parseDuration(editing.duration);
    if (!minutes) return setError("Write the time like 1:30, 1h 30m, 90m or 1.5");
    act(async () => {
      await apiRequest(`/time/entries/${editing.id}`, "PUT", { minutes, note: editing.note });
      setEditing(null);
    });
  };

  // grid: one row per task, one column per day
  const rows = useMemo(() => {
    const m = {};
    for (const e of data?.entries || []) {
      if (!e.minutes) continue;
      const key = e.task_id || "none";
      m[key] = m[key] || { key, task: e.task, project: e.project, byDay: {}, total: 0 };
      m[key].byDay[e.work_date] = (m[key].byDay[e.work_date] || 0) + e.minutes;
      m[key].total += e.minutes;
    }
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [data]);
  const dayTotal = (d) => rows.reduce((s, r) => s + (r.byDay[d] || 0), 0);
  const today = localDate();

  return (
    <div className="space-y-5">
      {/* timer */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">
              {running.task ? <Link to={`/tasks/${running.task_id}`} className="hover:underline">{running.task.title}</Link> : running.note || "No task"}
            </span>
            <span className="text-lg font-semibold tabular-nums text-gray-900">{fmtClock(running.started_at, now)}</span>
            <button onClick={() => act(stop)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-sm rounded-md hover:bg-rose-700">
              <Square size={12} className="fill-current" /> Stop
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-gray-500">Track time on</span>
            <TaskPicker tasks={tasks} value={timerTask} onChange={setTimerTask} label="Timer task" />
            <button onClick={() => act(() => start(timerTask || null))} className="flex items-center gap-1.5 px-3 py-1.5 btn-accent text-sm rounded-md">
              <Play size={12} className="fill-current" /> Start timer
            </button>
          </>
        )}
      </div>

      {/* week grid */}
      <div className="flex items-center gap-2">
        <button onClick={() => setMonday(shiftDate(monday, -7))} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-50" aria-label="Previous week"><ChevronLeft size={14} /></button>
        <p className="text-sm font-medium text-gray-900">{short(days[0])} – {short(days[6])}</p>
        <button onClick={() => setMonday(shiftDate(monday, 7))} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-50" aria-label="Next week"><ChevronRight size={14} /></button>
        {monday !== mondayOf(today) && <button onClick={() => setMonday(mondayOf(today))} className="text-xs text-gray-500 hover:text-gray-900 underline">This week</button>}
        <span className="ml-auto text-sm text-gray-500">Total <b className="text-gray-900 font-semibold">{fmtMinutes(data?.total_minutes)}</b></span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th className="text-left px-4 py-2 font-medium">Task</th>
              {days.map((d, i) => (
                <th key={d} className={`px-2 py-2 font-medium text-right w-16 ${d === today ? "text-gray-900" : ""}`}>{DAY_NAMES[i]}<span className="block font-normal text-[10px] text-gray-400">{short(d)}</span></th>
              ))}
              <th className="px-4 py-2 font-medium text-right w-20">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No time this week yet. Start a timer or log time below.</td></tr>}
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2 max-w-64">
                  {r.task ? <Link to={`/tasks/${r.task.id}`} className="text-gray-900 hover:underline truncate block">{r.task.title}</Link> : <span className="text-gray-500">No task</span>}
                  {r.project && <span className="text-[11px] text-gray-400">{r.project.name}</span>}
                </td>
                {days.map((d) => <td key={d} className={`px-2 py-2 text-right tabular-nums ${r.byDay[d] ? "text-gray-800" : "text-gray-300"}`}>{r.byDay[d] ? fmtMinutes(r.byDay[d]) : "–"}</td>)}
                <td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">{fmtMinutes(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-100 text-xs text-gray-500">
                <td className="px-4 py-2">Per day</td>
                {days.map((d) => <td key={d} className="px-2 py-2 text-right tabular-nums">{dayTotal(d) ? fmtMinutes(dayTotal(d)) : ""}</td>)}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* add */}
      <form onSubmit={add} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
        <TaskPicker tasks={tasks} value={form.task} onChange={(task) => setForm({ ...form, task })} />
        <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Day" />
        <input className={`${inputCls} w-24`} placeholder="1:30" aria-label="Time spent" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
        <input className={`${inputCls} flex-1 min-w-40`} placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        {inCompany && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} /> Billable</label>
        )}
        <button className="px-3 py-1.5 btn-accent text-sm rounded-md">Log time</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* entries */}
      {(data?.entries.length || 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {[...data.entries].reverse().map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm group">
              <span className="text-xs text-gray-400 w-20 shrink-0">{short(e.work_date)}</span>
              <span className="flex-1 min-w-0 truncate text-gray-800">
                {e.task?.title || <span className="text-gray-400">No task</span>}
                {!inCompany && e.company_id && <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">company</span>}
                {e.billable && <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">billable</span>}
                {editing?.id !== e.id && e.note && <span className="text-gray-400"> — {e.note}</span>}
              </span>
              {editing?.id === e.id ? (
                <>
                  <input className={`${inputCls} w-40`} value={editing.note} onChange={(ev) => setEditing({ ...editing, note: ev.target.value })} aria-label="Edit note" />
                  <input className={`${inputCls} w-20`} value={editing.duration} onChange={(ev) => setEditing({ ...editing, duration: ev.target.value })} aria-label="Edit time" />
                  <button onClick={saveEdit} className="text-xs px-2 py-1 btn-accent rounded">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-gray-500">Cancel</button>
                </>
              ) : (
                <>
                  <span className="tabular-nums font-medium text-gray-900 w-16 text-right">{e.ended_at || !e.started_at ? fmtMinutes(e.minutes) : "running"}</span>
                  {(e.ended_at || !e.started_at) && (
                    <>
                      <button onClick={() => setEditing({ id: e.id, note: e.note || "", duration: fmtMinutes(e.minutes) })} className="text-xs text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100">Edit</button>
                      <button onClick={() => act(() => apiRequest(`/time/entries/${e.id}`, "DELETE"))} aria-label="Delete entry" className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><X size={13} /></button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Report (company) ─────────────────────────────────────────────────────────
function DayTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-900">{short(label)}</p>
      <p className="text-gray-600">{fmtMinutes(payload[0].value)}</p>
    </div>
  );
}

function Report() {
  const { teams } = useCompanyPeople();
  const projects = useMyProjects();
  const companyId = getWorkspace();
  const today = localDate();
  const [q, setQ] = useState({ from: `${today.slice(0, 8)}01`, to: today, group: "person", team_id: "", project_id: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const params = useMemo(() => Object.fromEntries(Object.entries(q).filter(([, v]) => v)), [q]);

  useEffect(() => {
    apiRequest(`/time/report?${new URLSearchParams(params)}`).then(setData).catch((err) => setError(err.message));
  }, [params]);

  const download = async () => {
    const r = await api.get("/time/report", { params: { ...params, format: "csv" }, responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-${q.from}-to-${q.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // fill empty days so the chart reads as a calendar
  const series = useMemo(() => {
    if (!data) return [];
    const m = Object.fromEntries(data.days.map((d) => [d.date, d.minutes]));
    const out = [];
    for (let d = data.from; d <= data.to && out.length < 120; d = shiftDate(d, 1)) out.push({ date: d, minutes: m[d] || 0 });
    return out;
  }, [data]);

  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className={inputCls} value={q.from} onChange={set("from")} aria-label="From" />
        <span className="text-gray-400">→</span>
        <input type="date" className={inputCls} value={q.to} onChange={set("to")} aria-label="To" />
        <select className={inputCls} value={q.team_id} onChange={set("team_id")} aria-label="Team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={inputCls} value={q.project_id} onChange={set("project_id")} aria-label="Project">
          <option value="">All projects</option>
          {projects.filter((p) => p.company_id === companyId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => download().catch((err) => setError(err.message))} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm rounded-md hover:bg-gray-50">
          <Download size={13} /> CSV
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <>
          <p className="text-xs text-gray-400">
            {data.scope === "company" ? "Everyone's time in the company." : data.scope === "teams" ? "Your time, plus the teams you lead or manage." : "Only your own time."} Personal time is never included.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[["Logged", fmtMinutes(data.total_minutes), ClockCountdown, "amber"], ["Billable", fmtMinutes(data.billable_minutes), CurrencyCircleDollar, "teal"], ["Entries", data.groups.reduce((s, g) => s + g.entries, 0), ListBullets, "indigo"]].map(([l, v, icon, hue]) => (
              <StatCard key={l} label={l} value={v} icon={icon} hue={hue} />
            ))}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">Hours per day</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                  <XAxis dataKey="date" tickFormatter={short} {...axisProps} minTickGap={16} />
                  <YAxis tickFormatter={(m) => `${Math.round(m / 60)}h`} {...axisProps} allowDecimals={false} />
                  <Tooltip content={<DayTip />} cursor={{ fill: "var(--viz-grid)", opacity: 0.6 }} />
                  <Bar dataKey="minutes" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="flex gap-1 mb-2">
              {[["person", "People"], ["team", "Teams"], ["project", "Projects"], ["task", "Tasks (estimate vs actual)"]].map(([k, l]) => (
                <button key={k} onClick={() => setQ({ ...q, group: k })}
                  className={`px-3 py-1 text-xs rounded-md ${q.group === k ? "btn-accent " : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{l}</button>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">Name</th>
                    {q.group === "task" && <th className="px-2 py-2 font-medium text-right">Estimate</th>}
                    <th className="px-2 py-2 font-medium text-right">Logged</th>
                    {q.group === "task" && <th className="px-2 py-2 font-medium text-right">Difference</th>}
                    <th className="px-2 py-2 font-medium text-right">Billable</th>
                    <th className="px-4 py-2 font-medium text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.groups.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No time logged in this range.</td></tr>}
                  {data.groups.map((g) => {
                    const diff = g.estimate_minutes !== null && g.estimate_minutes !== undefined ? g.minutes - g.estimate_minutes : null;
                    const share = data.total_minutes ? Math.round((g.minutes / data.total_minutes) * 100) : 0;
                    return (
                      <tr key={g.key}>
                        <td className="px-4 py-2 text-gray-900">{q.group === "task" && g.key !== "none" ? <Link to={`/tasks/${g.key}`} className="hover:underline">{g.label}</Link> : g.label}</td>
                        {q.group === "task" && (
                          <td className="px-2 py-2 text-right text-gray-600 tabular-nums">
                            {g.estimate_minutes !== null && g.estimate_minutes !== undefined ? fmtMinutes(g.estimate_minutes) : g.estimate !== null && g.estimate !== undefined ? `${g.estimate} pt` : "–"}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right text-gray-900 font-medium tabular-nums">{fmtMinutes(g.minutes)}</td>
                        {q.group === "task" && (
                          <td className={`px-2 py-2 text-right tabular-nums ${diff > 0 ? "text-rose-600" : diff < 0 ? "text-emerald-700" : "text-gray-400"}`}>
                            {diff === null ? "–" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtMinutes(Math.abs(diff))}`}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right text-gray-600 tabular-nums">{g.billable_minutes ? fmtMinutes(g.billable_minutes) : "–"}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: "var(--viz-1)" }} /></div>
                            <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {q.group === "task" && <p className="text-[11px] text-gray-400 mt-2">Estimates compare with logged time only for teams that estimate in hours. Points are shown as they are.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// Timesheet: your week (any workspace) and, in a company, a time report
export default function Timesheet() {
  const companyId = getWorkspace();
  const [tab, setTab] = useState("week");
  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-5">
      <div>
        <h1 className="page-title"><AreaTile /> Timesheet</h1>
        <p className="text-sm text-gray-500 mt-1">
          {companyId ? "Time you've spent on this company's work." : "All your time — personal and company work. Personal time is only ever visible to you."}
        </p>
      </div>
      {companyId && (
        <div className="flex gap-6 border-b border-gray-200">
          {[["week", "My week"], ["report", "Report"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`pb-2 text-sm -mb-px border-b-2 ${tab === k ? "border-indigo-600 text-indigo-700 font-semibold" : "border-transparent text-gray-500 hover:text-gray-900"}`}>{l}</button>
          ))}
        </div>
      )}
      {tab === "report" && companyId ? <Report /> : <MyWeek />}
    </div>
  );
}
