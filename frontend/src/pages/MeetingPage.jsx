import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarArrowDown, Check, CheckCircle2, ExternalLink, Lock, Plus, Repeat, ThumbsUp, Trash2, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import api from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import { useLiveEvent } from "../utils/live";
import { kindLabel } from "../utils/meetings";
import MeetingAI from "../components/MeetingAI";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const who = (u) => u?.name || u?.email;
const RESPONSE = { yes: "Going", no: "Not going", maybe: "Maybe", pending: "No reply" };
const RESPONSE_DOT = { yes: "bg-emerald-500", no: "bg-rose-500", maybe: "bg-amber-500", pending: "bg-gray-300" };
const RETRO = [
  ["went_well", "Went well", "bg-emerald-50 border-emerald-200"],
  ["to_improve", "To improve", "bg-rose-50 border-rose-200"],
  ["idea", "Ideas", "bg-blue-50 border-blue-200"],
];

// Text area that saves when you click away
function AutoText({ label, value, disabled, onSave, rows = 6, placeholder }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState("");
  const last = useRef(value);
  useEffect(() => { setText(value); last.current = value; }, [value]);
  const save = async () => {
    if (text === last.current) return;
    setState("Saving…");
    try {
      await onSave(text);
      last.current = text;
      setState("Saved");
    } catch (err) {
      setState(err.message);
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <span className="text-xs text-gray-400">{state}</span>
      </div>
      <textarea rows={rows} disabled={disabled} className={`${inputCls} w-full font-[inherit] disabled:bg-gray-50`} placeholder={placeholder}
        value={text} onChange={(e) => { setText(e.target.value); setState(""); }} onBlur={save} />
    </div>
  );
}

// One line you can add to: topics, decisions, actions
function ItemAdder({ placeholder, onAdd, withPeople, members }) {
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  return (
    <form className="flex flex-wrap gap-2 mt-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      await onAdd({ text, assignee_id: assignee || null, due_date: due || null });
      setText(""); setAssignee(""); setDue("");
    }}>
      <input className={`${inputCls} flex-1 min-w-[180px] py-1.5`} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      {withPeople && (
        <>
          <select className={`${inputCls} py-1.5 text-xs`} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Owner">
            <option value="">Owner…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
          <input type="date" className={`${inputCls} py-1.5 text-xs`} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        </>
      )}
      <button className="px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50" aria-label="Add"><Plus size={14} /></button>
    </form>
  );
}

export default function MeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { members } = useCompanyPeople();
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const load = useCallback(() => apiRequest(`/meetings/${id}`).then(setM).catch((err) => setError(err.message)), [id]);
  useEffect(() => { setM(null); load(); }, [load]);
  useLiveEvent("meeting", load);

  const act = async (fn, msg) => {
    setError("");
    try {
      const out = await fn();
      if (msg) setFlash(typeof msg === "function" ? msg(out) : msg);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !m) return <p className="p-8 text-sm text-gray-500">{error}</p>;
  if (!m)
    return (
      <div className="p-8">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );

  const base = `/meetings/${m.id}`;
  const items = (kind) => m.items.filter((i) => i.kind === kind);
  const addItem = (kind) => (body) => act(() => apiRequest(`${base}/items`, "POST", { kind, ...body }));
  const toggleItem = (i) => act(() => apiRequest(`${base}/items/${i.id}`, "PUT", { done: !i.done }));
  const removeItem = (i) => act(() => apiRequest(`${base}/items/${i.id}`, "DELETE"));
  const start = new Date(m.starts_at);
  const end = new Date(start.getTime() + m.duration_min * 60000);
  const isLink = m.location?.startsWith("http");
  const downloadIcs = async () => {
    // authenticated download (the axios client adds the token), then save
    const r = await api.get(`${base}/ics`, { responseType: "blob", headers: { "X-Company-Id": m.company_id } });
    const url = URL.createObjectURL(r.data);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${m.title}.ics` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const ItemRow = ({ i, check = true }) => (
    <div className="flex items-start gap-2 py-1 group">
      {check ? (
        <input type="checkbox" className="mt-1" checked={i.done} disabled={!m.can_note} onChange={() => toggleItem(i)} aria-label={i.text} />
      ) : (
        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${i.done ? "line-through text-gray-400" : "text-gray-800"}`}>{i.text}</p>
        {i.kind === "action" && (
          <p className="text-xs text-gray-500">
            {i.assignee ? who(i.assignee) : "No owner yet"}{i.due_date && <> · due {i.due_date}</>}
            {i.task_id && <> · <Link to={`/tasks/${i.task_id}`} className="underline">task</Link></>}
          </p>
        )}
      </div>
      {i.kind === "action" && !i.task_id && m.can_note && (
        <button className="text-xs px-2 py-0.5 border border-gray-200 rounded-md hover:bg-gray-50 shrink-0"
          onClick={() => act(() => apiRequest(`${base}/items/${i.id}/task`, "POST"), "Task created")}>
          Make task
        </button>
      )}
      {m.can_note && (
        <button className="p-0.5 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100" aria-label="Delete" onClick={() => removeItem(i)}>
          <X size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-5">
      <button onClick={() => navigate("/meetings")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft size={14} /> Meetings
      </button>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            {kindLabel(m.kind)}{m.team && <> · {m.team.name}</>}
            {m.recurrence && <><Repeat size={11} /> {m.recurrence === "biweekly" ? "every 2 weeks" : m.recurrence}</>}
            {m.private && <><Lock size={11} /> private</>}
          </p>
          <h1 className={`text-xl font-semibold text-gray-900 ${m.status === "cancelled" ? "line-through" : ""}`}>{m.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {start.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} ·{" "}
            {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {m.location && (isLink
              ? <> · <a href={m.location} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">join <ExternalLink size={11} /></a></>
              : <> · {m.location}</>)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadIcs} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm rounded-md hover:bg-gray-50 bg-white">
            <CalendarArrowDown size={14} /> Add to calendar
          </button>
          {m.can_note && m.status === "scheduled" && (
            <button onClick={() => act(() => apiRequest(`${base}/finish`, "POST", {}), (o) => `Done. ${o.tasks_created} task(s) created and notes sent.`)}
              className="flex items-center gap-1.5 px-3 py-1.5 btn-accent text-sm rounded-md">
              <CheckCircle2 size={14} /> Finish & send notes
            </button>
          )}
          {m.can_edit && m.status === "scheduled" && (
            <button onClick={() => window.confirm("Cancel this meeting? Everyone is told.") && act(() => apiRequest(base, "PUT", { status: "cancelled" }))}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">Cancel meeting</button>
          )}
          {m.can_edit && (
            <button title="Delete" onClick={() => window.confirm(m.series_id ? "Delete this and all later meetings in the series?" : "Delete this meeting?") &&
              act(() => apiRequest(`${base}${m.series_id ? "?series=1" : ""}`, "DELETE")).then(() => navigate("/meetings"))}
              className="p-1.5 text-gray-300 hover:text-rose-500"><Trash2 size={15} /></button>
          )}
        </div>
      </div>

      {flash && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{flash}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* people */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {m.attendees.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 text-sm text-gray-700" title={RESPONSE[a.response]}>
              <span className={`w-2 h-2 rounded-full ${RESPONSE_DOT[a.response]}`} /> {who(a)}
            </span>
          ))}
        </div>
        {m.my_response && m.status === "scheduled" && (
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="text-gray-500">Are you coming?</span>
            {["yes", "maybe", "no"].map((r) => (
              <button key={r} onClick={() => act(() => apiRequest(`${base}/respond`, "POST", { response: r }))}
                className={`px-2.5 py-1 rounded-md border ${m.my_response === r ? "btn-accent border-indigo-600" : "border-gray-200 hover:bg-gray-50"}`}>
                {RESPONSE[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!m.can_note && <p className="text-xs text-gray-400">You can read this meeting; only the people in it add notes.</p>}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <AutoText label="Agenda" value={m.agenda} disabled={!m.can_note} rows={7}
            onSave={(agenda) => apiRequest(base, "PUT", { agenda })} />
          {(m.kind === "one_on_one" || m.kind === "meeting" || m.kind === "review") && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500">Talking points {m.kind === "one_on_one" && <span className="font-normal text-gray-400">(unticked ones carry over to next time)</span>}</p>
              {items("topic").map((i) => <ItemRow key={i.id} i={i} />)}
              {m.can_note && <ItemAdder placeholder="Add a talking point" onAdd={addItem("topic")} />}
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <AutoText label="Notes" value={m.notes} disabled={!m.can_note} rows={10} placeholder="What was said…"
            onSave={(notes) => apiRequest(base, "PUT", { notes })} />
        </div>
      </div>

      <MeetingAI meeting={m} onChanged={load} />

      {m.kind === "retro" && (
        <div className="grid md:grid-cols-3 gap-3">
          {RETRO.map(([kind, label, style]) => (
            <div key={kind} className={`border rounded-lg p-3 ${style}`}>
              <p className="text-sm font-semibold text-gray-900 mb-2">{label}</p>
              <div className="space-y-2">
                {items(kind).sort((a, b) => b.vote_count - a.vote_count).map((i) => (
                  <div key={i.id} className="bg-white rounded-md p-2 text-sm text-gray-800 flex items-start gap-2 group">
                    <span className="flex-1">{i.text}</span>
                    <button disabled={!m.can_note} onClick={() => act(() => apiRequest(`${base}/items/${i.id}/vote`, "POST"))}
                      className={`flex items-center gap-0.5 text-xs ${i.voted ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-700"}`} aria-label="Vote">
                      <ThumbsUp size={12} /> {i.vote_count}
                    </button>
                    {m.can_note && (
                      <button className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100" aria-label="Delete" onClick={() => removeItem(i)}><X size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
              {m.can_note && <ItemAdder placeholder="Add a card" onAdd={addItem(kind)} />}
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Check size={14} /> Decisions</p>
          {items("decision").length === 0 && <p className="text-xs text-gray-400 mt-1">Write down what was agreed, so nobody has to remember.</p>}
          {items("decision").map((i) => <ItemRow key={i.id} i={i} check={false} />)}
          {m.can_note && <ItemAdder placeholder="We decided…" onAdd={addItem("decision")} />}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900">Action items</p>
          {items("action").length === 0 && <p className="text-xs text-gray-400 mt-1">Each one becomes a task for its owner when you finish the meeting.</p>}
          {items("action").map((i) => <ItemRow key={i.id} i={i} />)}
          {m.can_note && <ItemAdder placeholder="Who does what…" onAdd={addItem("action")} withPeople members={members} />}
        </div>
      </div>

      {m.previous.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Earlier in this series</p>
          <div className="flex flex-wrap gap-2">
            {m.previous.map((p) => (
              <Link key={p.id} to={`/meetings/${p.id}`} className="text-xs px-2.5 py-1 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
                {new Date(p.starts_at).toLocaleDateString()}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
