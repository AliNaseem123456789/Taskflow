import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CalendarPlus, Lock, Repeat, Users, Video } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace, getStoredUser } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import { useLiveEvent } from "../utils/live";
import { localDate } from "../utils/date";
import { MEETING_KINDS, kindLabel } from "../utils/meetings";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const RESPONSE_STYLE = { yes: "text-emerald-600", no: "text-rose-600", maybe: "text-amber-600", pending: "text-gray-400" };

const dayKey = (iso) => localDate(new Date(iso));
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (key) => {
  const today = localDate();
  const tomorrow = localDate(new Date(Date.now() + 86400000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Date(`${key}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
};

// The "new meeting" form
function NewMeeting({ onCreated, onCancel }) {
  const me = getStoredUser();
  const { members, teams } = useCompanyPeople();
  const nextHour = new Date(Date.now() + 3600000);
  nextHour.setMinutes(0, 0, 0);
  const [form, setForm] = useState({
    title: "", kind: "meeting", date: localDate(nextHour),
    time: `${String(nextHour.getHours()).padStart(2, "0")}:00`, duration_min: 30,
    location: "", team_id: "", recurrence: "", attendee_ids: [],
  });
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const others = members.filter((m) => m.id !== me?.id);
  const toggle = (id) =>
    set({ attendee_ids: form.kind === "one_on_one" ? [id] : form.attendee_ids.includes(id) ? form.attendee_ids.filter((x) => x !== id) : [...form.attendee_ids, id] });
  const addTeam = (teamId) => {
    // invite a whole team in one click (needs the team's people from the org chart)
    apiRequest(`/companies/${getWorkspace()}/org`).then((org) => {
      const ids = org.teams.find((t) => t.id === teamId)?.members.map((m) => m.id).filter((id) => id !== me?.id) || [];
      set({ team_id: teamId, attendee_ids: [...new Set([...form.attendee_ids, ...ids])] });
    }).catch(() => set({ team_id: teamId }));
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const starts = new Date(`${form.date}T${form.time}`);
      const m = await apiRequest("/meetings", "POST", {
        title: form.title, kind: form.kind, starts_at: starts.toISOString(), duration_min: Number(form.duration_min),
        location: form.location || null, team_id: form.team_id || null, recurrence: form.recurrence || null, attendee_ids: form.attendee_ids,
      });
      onCreated(m);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={save} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 mb-6">
      <div className="flex flex-wrap gap-1">
        {MEETING_KINDS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => set({ kind: k, attendee_ids: k === "one_on_one" ? form.attendee_ids.slice(0, 1) : form.attendee_ids, recurrence: k === "one_on_one" && !form.recurrence ? "weekly" : form.recurrence })}
            className={`px-3 py-1 text-xs rounded-full border ${form.kind === k ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
            {label}
          </button>
        ))}
      </div>
      <input required autoFocus className={`${inputCls} w-full`} placeholder={form.kind === "one_on_one" ? "e.g. Sara / Ali weekly 1:1" : "What's it about?"}
        value={form.title} onChange={(e) => set({ title: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <input type="date" required className={inputCls} value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <input type="time" required className={inputCls} value={form.time} onChange={(e) => set({ time: e.target.value })} />
        <select className={inputCls} value={form.duration_min} onChange={(e) => set({ duration_min: e.target.value })}>
          {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
        </select>
        <select className={inputCls} value={form.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
          <option value="">Doesn't repeat</option>
          <option value="weekly">Every week</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Every month</option>
        </select>
      </div>
      <input className={`${inputCls} w-full`} placeholder="Room or video link (optional)" value={form.location} onChange={(e) => set({ location: e.target.value })} />
      {form.kind !== "one_on_one" && teams.length > 0 && (
        <select className={inputCls} value={form.team_id} onChange={(e) => (e.target.value ? addTeam(e.target.value) : set({ team_id: "" }))}>
          <option value="">Not a team meeting</option>
          {teams.map((t) => <option key={t.id} value={t.id}>Team meeting: {t.name} (invites the team)</option>)}
        </select>
      )}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{form.kind === "one_on_one" ? "With" : "Who's coming"} <span className="font-normal text-gray-400">(you're included)</span></p>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {others.map((m) => (
            <button key={m.id} type="button" onClick={() => toggle(m.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${form.attendee_ids.includes(m.id) ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-700 hover:border-gray-400"}`}>
              {m.name || m.email}
            </button>
          ))}
          {others.length === 0 && <p className="text-xs text-gray-400">Nobody else in the company yet.</p>}
        </div>
      </div>
      {form.kind === "one_on_one" && <p className="text-xs text-gray-400">1:1 notes are private to the two of you; not even admins can read them.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">Schedule</button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-gray-500">Cancel</button>
      </div>
    </form>
  );
}

// Upcoming and recent meetings in the chosen company
export default function Meetings() {
  const companyId = getWorkspace();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(() => {
    if (!companyId) return;
    apiRequest("/meetings").then(setMeetings).catch(() => setMeetings([]));
  }, [companyId]);
  useEffect(() => { load(); }, [load]);
  useLiveEvent(["meeting", "notification"], load);

  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (!meetings)
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );

  const now = Date.now();
  const upcoming = meetings.filter((m) => new Date(m.starts_at).getTime() + m.duration_min * 60000 >= now && m.status !== "done");
  const past = meetings.filter((m) => !upcoming.includes(m)).reverse();
  const list = showPast ? past : upcoming;
  const groups = list.reduce((acc, m) => {
    (acc[dayKey(m.starts_at)] = acc[dayKey(m.starts_at)] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Meetings</h1>
          <p className="text-sm text-gray-500 mt-1">Agendas, notes and action items that turn into tasks.</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">
            <CalendarPlus size={14} /> New meeting
          </button>
        )}
      </div>

      {creating && <NewMeeting onCancel={() => setCreating(false)} onCreated={(m) => navigate(`/meetings/${m.id}`)} />}

      <div className="flex gap-1 mb-4">
        {[[false, `Upcoming (${upcoming.length})`], [true, `Past (${past.length})`]].map(([v, label]) => (
          <button key={label} onClick={() => setShowPast(v)}
            className={`px-3 py-1.5 text-sm rounded-md ${showPast === v ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg py-12 text-center text-gray-400">
          <Users size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">{showPast ? "No past meetings in the last 30 days." : "Nothing scheduled."}</p>
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(groups).map(([key, items]) => (
          <div key={key}>
            <p className="text-xs font-medium text-gray-500 mb-1.5">{dayLabel(key)}</p>
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              {items.map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 ${m.status === "cancelled" ? "opacity-50" : ""}`}>
                  <div className="w-16 shrink-0">
                    <p className="text-sm font-medium text-gray-900">{timeOf(m.starts_at)}</p>
                    <p className="text-[11px] text-gray-400">{m.duration_min} min</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm text-gray-900 truncate ${m.status === "cancelled" ? "line-through" : ""}`}>
                      {m.title}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <span>{kindLabel(m.kind)}</span>
                      {m.team && <span>· {m.team.name}</span>}
                      <span>· {m.attendees.length} people</span>
                      {m.recurrence && <Repeat size={11} />}
                      {m.private && <Lock size={11} />}
                      {m.location?.startsWith("http") && <Video size={11} />}
                    </p>
                  </div>
                  {m.status === "done" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">notes</span>}
                  {m.status === "cancelled" && <span className="text-[10px] text-gray-400">cancelled</span>}
                  {m.my_response && m.status === "scheduled" && (
                    <span className={`text-xs ${RESPONSE_STYLE[m.my_response]}`}>{m.my_response === "pending" ? "reply?" : m.my_response === "yes" ? "going" : m.my_response}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
