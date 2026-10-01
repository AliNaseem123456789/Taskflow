import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Plane, Trash2, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace, getStoredUser } from "../api/api";
import { useWorkspace } from "../utils/workspace";
import { localDate, shiftDate } from "../utils/date";
import AreaTile from "../components/AreaTile";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const KIND = { vacation: "Vacation", sick: "Sick", personal: "Personal", other: "Other", away: "Away" };
const STATUS_CHIP = { pending: "bg-amber-50 text-amber-700", approved: "bg-emerald-50 text-emerald-700", rejected: "bg-rose-50 text-rose-700" };
const who = (u) => u?.name || u?.email;
const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const range = (t) => (t.start_date === t.end_date ? fmt(t.start_date) : `${fmt(t.start_date)} – ${fmt(t.end_date)}`);
const DAYS = 28;

// Four weeks, one row per person who's away at some point
function AwayCalendar({ entries, holidays, start }) {
  const days = Array.from({ length: DAYS }, (_, i) => shiftDate(start, i));
  const people = [...new Map(entries.filter((e) => e.status !== "rejected").map((e) => [e.user_id, e.person])).entries()];
  const holidayOn = Object.fromEntries(holidays.map((h) => [h.date, h.name]));
  const cell = (uid, d) => entries.find((e) => e.user_id === uid && e.status !== "rejected" && e.start_date <= d && e.end_date >= d);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 overflow-x-auto">
      <table className="text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white text-left font-medium text-gray-500 pr-3 min-w-[110px]" />
            {days.map((d) => {
              const wd = new Date(`${d}T12:00:00`).getDay();
              return (
                <th key={d} title={holidayOn[d] || ""} className={`w-7 text-center font-normal ${wd === 0 || wd === 6 ? "text-gray-300" : holidayOn[d] ? "text-blue-600" : "text-gray-500"}`}>
                  <div>{"SMTWTFS"[wd]}</div>
                  <div className={d === localDate() ? "font-bold text-gray-900" : ""}>{d.slice(8)}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {people.length === 0 && (
            <tr><td colSpan={DAYS + 1} className="py-4 text-center text-gray-400">Nobody is away in the next four weeks.</td></tr>
          )}
          {people.map(([uid, person]) => (
            <tr key={uid}>
              <td className="sticky left-0 bg-white pr-3 py-1 text-gray-700 truncate max-w-[140px]">{who(person)}</td>
              {days.map((d) => {
                const e = cell(uid, d);
                const wd = new Date(`${d}T12:00:00`).getDay();
                const weekend = wd === 0 || wd === 6;
                return (
                  <td key={d} className="p-0.5">
                    <div title={e ? `${KIND[e.kind] || "Away"}${e.status === "pending" ? " (waiting for approval)" : ""}` : ""}
                      className={`h-5 rounded-sm ${e && !weekend ? (e.status === "pending" ? "bg-amber-200" : e.kind === "sick" ? "bg-rose-300" : "bg-emerald-400") : weekend ? "bg-gray-50" : holidayOn[d] ? "bg-blue-100" : "bg-gray-100"} ${e?.half_day ? "opacity-60" : ""}`} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400" /> away</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-200" /> waiting for approval</span>
        {entries.some((e) => e.kind === "sick") && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-300" /> sick</span>}
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-100" /> company holiday</span>
      </div>
    </div>
  );
}

export default function TimeOff() {
  const companyId = getWorkspace();
  const { current } = useWorkspace();
  const me = getStoredUser();
  const [entries, setEntries] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ start_date: localDate(), end_date: localDate(), kind: "vacation", half_day: false, note: "" });
  const [holiday, setHoliday] = useState({ date: "", name: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const start = localDate();
  const isAdmin = ["owner", "admin"].includes(current?.role);

  const load = useCallback(() => {
    if (!companyId) return;
    apiRequest(`/companies/${companyId}/time-off?from=${shiftDate(start, -60)}&to=${shiftDate(start, 120)}`).then(setEntries).catch(() => setEntries([]));
    apiRequest(`/companies/${companyId}/holidays`).then(setHolidays).catch(() => {});
  }, [companyId, start]);
  useEffect(() => { load(); }, [load]);

  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (!entries) return <div className="p-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>;

  const run = async (fn, ok) => {
    setError("");
    setMsg("");
    try {
      const out = await fn();
      if (ok) setMsg(typeof ok === "function" ? ok(out) : ok);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const request = (e) => {
    e.preventDefault();
    run(() => apiRequest(`/companies/${companyId}/time-off`, "POST", { ...form, end_date: form.half_day ? form.start_date : form.end_date }),
      (t) => (t.status === "approved" ? "Booked." : "Sent to your manager for approval."));
  };

  const toDecide = entries.filter((e) => e.can_decide);
  const mine = entries.filter((e) => e.user_id === me?.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const calendar = entries.filter((e) => e.end_date >= start && e.start_date <= shiftDate(start, DAYS - 1));
  const upcomingHolidays = holidays.filter((h) => h.date >= start);

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="page-title"><AreaTile />Time off</h1>
        <p className="text-sm text-gray-500 mt-1">Book days away and see who's out. Others see when you're away, not why.</p>
      </div>

      <form onSubmit={request} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {["vacation", "sick", "personal", "other"].map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
          </select>
          <input type="date" required className={inputCls} value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.end_date < e.target.value ? e.target.value : form.end_date })} />
          {!form.half_day && (
            <>
              <span className="text-xs text-gray-400">to</span>
              <input type="date" required className={inputCls} min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={form.half_day} onChange={(e) => setForm({ ...form, half_day: e.target.checked })} /> Half day
          </label>
        </div>
        <input className={`${inputCls} w-full`} placeholder="Note for your manager (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 px-3 py-2 btn-accent text-sm rounded-md"><Plane size={14} /> Book time off</button>
          {msg && <span className="text-xs text-emerald-600">{msg}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        <p className="text-xs text-gray-400">Sick days are booked straight away; other time off goes to your manager.</p>
      </form>

      {toDecide.length > 0 && (
        <div>
          <h2 className="font-display text-[17px] font-bold text-gray-900 mb-2">Waiting for you ({toDecide.length})</h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {toDecide.map((t) => (
              <div key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm text-gray-900"><b className="font-medium">{who(t.person)}</b> · {KIND[t.kind]} · {range(t)} <span className="text-gray-400">({t.days} {t.days === 1 ? "day" : "days"})</span></p>
                  {t.note && <p className="text-xs text-gray-500">“{t.note}”</p>}
                </div>
                <button className="flex items-center gap-1 px-2.5 py-1 btn-accent text-xs rounded-md"
                  onClick={() => run(() => apiRequest(`/companies/${companyId}/time-off/${t.id}/decide`, "POST", { decision: "approve" }))}><Check size={12} /> Approve</button>
                <button className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 text-xs rounded-md hover:bg-gray-50"
                  onClick={() => run(() => apiRequest(`/companies/${companyId}/time-off/${t.id}/decide`, "POST", { decision: "reject" }))}><X size={12} /> Decline</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-[17px] font-bold text-gray-900 mb-2">Who's away · next 4 weeks</h2>
        <AwayCalendar entries={calendar} holidays={holidays} start={start} />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h2 className="font-display text-[17px] font-bold text-gray-900 mb-2">Your time off</h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {mine.length === 0 && <p className="p-4 text-sm text-gray-400">Nothing booked.</p>}
            {mine.map((t) => (
              <div key={t.id} className="px-4 py-2.5 flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{KIND[t.kind]} · {range(t)}</p>
                  <p className="text-xs text-gray-400">{t.days} working {t.days === 1 ? "day" : "days"}{t.half_day && " (half)"}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[t.status]}`}>{t.status}</span>
                {t.can_cancel && (
                  <button className="text-xs text-gray-400 hover:text-gray-700" onClick={() => run(() => apiRequest(`/companies/${companyId}/time-off/${t.id}/cancel`, "POST"))}>Cancel</button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-display text-[17px] font-bold text-gray-900 mb-2">Company holidays</h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {upcomingHolidays.length === 0 && <p className="p-4 text-sm text-gray-400">None coming up.</p>}
            {upcomingHolidays.map((h) => (
              <div key={h.id} className="px-4 py-2.5 flex items-center gap-2">
                <p className="text-sm text-gray-900 flex-1">{h.name}</p>
                <span className="text-xs text-gray-500">{fmt(h.date)}</span>
                {isAdmin && (
                  <button className="p-1 text-gray-300 hover:text-rose-500" aria-label={`Remove ${h.name}`}
                    onClick={() => run(() => apiRequest(`/companies/${companyId}/holidays/${h.id}`, "DELETE"))}><Trash2 size={13} /></button>
                )}
              </div>
            ))}
            {isAdmin && (
              <form className="p-3 flex flex-wrap gap-2" onSubmit={(e) => {
                e.preventDefault();
                run(() => apiRequest(`/companies/${companyId}/holidays`, "POST", holiday), () => { setHoliday({ date: "", name: "" }); return "Holiday added."; });
              }}>
                <input type="date" required className={`${inputCls} py-1.5`} value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} />
                <input required className={`${inputCls} py-1.5 flex-1 min-w-[120px]`} placeholder="e.g. Eid ul-Fitr" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} />
                <button className="px-2.5 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50">Add</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
