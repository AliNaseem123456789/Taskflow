import { useCallback, useEffect, useState } from "react";
import { Clock, Play, Square, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";
import { localDate } from "../utils/date";
import { fmtClock, fmtMinutes, onTimerChange, parseDuration, useTimer } from "../utils/timer";

const inputCls = "text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";

// Time on one task: start/stop a timer, log time by hand, and how it compares to the estimate.
export default function TaskTime({ task, opts, canLog }) {
  const { running, now, start, stop } = useTimer();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ duration: "", date: localDate(), note: "" });
  const [error, setError] = useState("");
  const me = getStoredUser()?.id;

  const load = useCallback(
    () => apiRequest(`/time/tasks/${task.id}`, "GET", null, opts).then(setData).catch(() => setData(null)),
    [task.id, opts.company, opts.personal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => { load(); }, [load]);
  useEffect(() => onTimerChange(load), [load]);

  const here = running?.task_id === task.id;
  const act = async (fn) => {
    setError("");
    try { await fn(); await load(); } catch (err) { setError(err.message); }
  };

  const log = (e) => {
    e.preventDefault();
    const minutes = parseDuration(form.duration);
    if (!minutes) return setError("Write the time like 1:30, 1h 30m, 90m or 1.5");
    act(async () => {
      await apiRequest("/time/entries", "POST", { task_id: task.id, work_date: form.date, minutes, note: form.note }, opts);
      setForm({ ...form, duration: "", note: "" });
    });
  };

  if (!data) return null;
  const est = data.estimate_minutes;
  const pct = est ? Math.round((data.total_minutes / est) * 100) : null;

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={14} className="text-gray-400" />
        <h2 className="font-display text-[17px] font-bold text-gray-900 flex-1">
          Time <span className="font-normal text-gray-500">· {fmtMinutes(data.total_minutes)} logged
            {data.total_minutes !== data.mine_minutes && data.mine_minutes > 0 && ` (${fmtMinutes(data.mine_minutes)} by you)`}</span>
        </h2>
        {canLog && (here ? (
          <button onClick={() => act(stop)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs rounded-md hover:bg-rose-700">
            <Square size={11} className="fill-current" /> Stop · <span className="tabular-nums">{fmtClock(running.started_at, now)}</span>
          </button>
        ) : (
          <button onClick={() => act(() => start(task.id, opts))} className="flex items-center gap-1.5 px-3 py-1.5 btn-accent text-xs rounded-md">
            <Play size={11} className="fill-current" /> Start timer
          </button>
        ))}
      </div>

      {task.estimate !== null && task.estimate !== undefined && (
        est ? (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Estimate {fmtMinutes(est)}</span>
              <span className={pct > 100 ? "text-rose-600 font-medium" : ""}>{pct}% used{pct > 100 ? ` · ${fmtMinutes(data.total_minutes - est)} over` : ""}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pct > 100 ? "#e11d48" : "var(--viz-1)" }} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Estimate: {task.estimate} {data.estimate_unit === "points" ? "points" : "h"} — points can't be compared with hours.</p>
        )
      )}

      {data.people.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {data.people.map((p) => <span key={p.user.id}>{p.user.name || p.user.email}: <b className="font-medium text-gray-900">{fmtMinutes(p.minutes)}</b></span>)}
        </div>
      )}

      {canLog && (
        <form onSubmit={log} className="flex flex-wrap gap-2">
          <input className={`${inputCls} w-24`} placeholder="1:30" aria-label="Time spent" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Day" />
          <input className={`${inputCls} flex-1 min-w-32`} placeholder="What did you do? (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className="px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50">Log time</button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {data.entries.length > 0 && (
        <div className="divide-y divide-gray-50 text-xs">
          {data.entries.slice(0, 8).map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-1.5 group">
              <span className="text-gray-400 w-20 shrink-0">{e.work_date}</span>
              <span className="text-gray-700 w-24 shrink-0 truncate">{e.user?.name || e.user?.email}</span>
              <span className="text-gray-900 font-medium w-14 shrink-0 tabular-nums">{e.ended_at || !e.started_at ? fmtMinutes(e.minutes) : "running"}</span>
              <span className="text-gray-500 truncate flex-1">{e.note}</span>
              {e.user_id === me && (e.ended_at || !e.started_at) && (
                <button aria-label="Delete entry" className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                  onClick={() => act(() => apiRequest(`/time/entries/${e.id}`, "DELETE", null, opts))}><X size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
