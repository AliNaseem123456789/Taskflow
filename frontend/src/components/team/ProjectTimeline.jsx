import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Diamond, Plus } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { useLiveEvent } from "../../utils/live";
import { localDate } from "../../utils/date";

const ROW = 34;          // px per task row
const LEFT = 220;        // task-name column
const ZOOM = { week: 28, month: 12, quarter: 5 }; // px per day
const dayNum = (d) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86400000);
const fromNum = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });

// A project's tasks on a calendar: bars from start to due date, arrows for
// "waits for", diamonds for milestones. Drag a bar to move it, drag its right
// edge to change the due date.
export default function ProjectTimeline({ team, project }) {
  const [data, setData] = useState(null);
  const [zoom, setZoom] = useState("month");
  const [drag, setDrag] = useState(null); // { id, mode, startX, delta }
  const [ms, setMs] = useState({ name: "", date: "" });
  const [error, setError] = useState("");
  const scroller = useRef(null);
  const base = `/teams/${team.id}/projects/${project.id}`;

  const load = useCallback(() => apiRequest(`${base}/timeline`).then(setData).catch((err) => setError(err.message)), [base]);
  useEffect(() => { load(); }, [load]);
  useLiveEvent(["task", "project"], load);

  // scroll so today is in view the first time
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current || !scroller.current) return;
    scrolled.current = true;
    const startN = rangeOf(data).start;
    scroller.current.scrollLeft = Math.max(0, (dayNum(localDate()) - startN - 7) * ZOOM[zoom]);
  }, [data, zoom]);

  if (error && !data) return <p className="text-sm text-gray-500">{error}</p>;
  if (!data) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;

  const px = ZOOM[zoom];
  const { start, end } = rangeOf(data);
  const days = end - start + 1;
  const width = days * px;
  const x = (d) => (dayNum(d) - start) * px;
  const rows = data.tasks;
  const indexOf = Object.fromEntries(rows.map((t, i) => [t.id, i]));
  const today = localDate();

  // bar position while dragging
  const barOf = (t) => {
    let s = dayNum(t.bar_start);
    let e = dayNum(t.bar_end);
    if (drag?.id === t.id) {
      if (drag.mode === "move") { s += drag.delta; e += drag.delta; }
      else e = Math.max(s, e + drag.delta);
    }
    return { left: (s - start) * px, width: Math.max(px, (e - s + 1) * px), s, e };
  };

  const onDown = (e, t, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: t.id, mode, startX: e.clientX, delta: 0 });
  };
  const onMove = (e) => drag && setDrag({ ...drag, delta: Math.round((e.clientX - drag.startX) / px) });
  const onUp = async () => {
    if (!drag) return;
    const t = rows.find((r) => r.id === drag.id);
    const { s, e } = barOf(t);
    const d = drag;
    setDrag(null);
    if (!d.delta) return;
    try {
      await apiRequest(`/tasks/${t.id}`, "PUT", { start_date: fromNum(s), due_date: fromNum(e) });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  // month labels across the top
  const months = [];
  for (let n = start; n <= end; n++) {
    const d = fromNum(n);
    if (n === start || d.endsWith("-01")) months.push({ n, label: new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", year: "numeric" }) });
  }
  const height = rows.length * ROW;

  return (
    <div className="space-y-3" onPointerMove={onMove} onPointerUp={onUp}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex gap-1">
          {Object.keys(ZOOM).map((z) => (
            <button key={z} onClick={() => setZoom(z)} className={`px-2.5 py-1 rounded-md capitalize ${zoom === z ? "btn-accent " : "bg-gray-100 text-gray-600"}`}>{z}</button>
          ))}
        </div>
        {data.can_manage && (
          <>
            <label className="flex items-center gap-1 text-gray-500 ml-2">Project
              <input type="date" className="border border-gray-200 rounded px-1.5 py-0.5 bg-white" defaultValue={data.project.start_date || ""}
                onBlur={(e) => apiRequest(`${base}`, "PUT", { start_date: e.target.value || null }).then(load).catch((err) => setError(err.message))} />
              →
              <input type="date" className="border border-gray-200 rounded px-1.5 py-0.5 bg-white" defaultValue={data.project.target_date || ""}
                onBlur={(e) => apiRequest(`${base}`, "PUT", { target_date: e.target.value || null }).then(load).catch((err) => setError(err.message))} />
            </label>
            <form className="flex items-center gap-1 ml-auto" onSubmit={(e) => {
              e.preventDefault();
              apiRequest(`${base}/milestones`, "POST", ms).then(() => { setMs({ name: "", date: "" }); load(); }).catch((err) => setError(err.message));
            }}>
              <input required className="border border-gray-200 rounded px-1.5 py-1 bg-white w-28" placeholder="Milestone" value={ms.name} onChange={(e) => setMs({ ...ms, name: e.target.value })} />
              <input required type="date" className="border border-gray-200 rounded px-1.5 py-0.5 bg-white" value={ms.date} onChange={(e) => setMs({ ...ms, date: e.target.value })} />
              <button className="p-1 border border-gray-200 rounded bg-white" aria-label="Add milestone"><Plus size={12} /></button>
            </form>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
        {/* task names */}
        <div className="shrink-0 border-r border-gray-100" style={{ width: LEFT }}>
          <div className="h-12 border-b border-gray-100 px-3 flex items-end pb-1 text-[11px] text-gray-400">Task</div>
          <div className="h-7 border-b border-gray-100 px-3 flex items-center text-[11px] text-gray-400">Milestones</div>
          {rows.map((t) => (
            <div key={t.id} style={{ height: ROW }} className="px-3 flex items-center border-b border-gray-50">
              <Link to={`/tasks/${t.id}`} className={`text-xs truncate hover:underline ${t.status === "Done" ? "text-gray-400 line-through" : t.late ? "text-rose-600" : "text-gray-800"}`} title={t.title}>
                {t.title}
              </Link>
            </div>
          ))}
          {rows.length === 0 && <p className="px-3 py-4 text-xs text-gray-400">No tasks yet.</p>}
        </div>

        {/* calendar */}
        <div ref={scroller} className="overflow-x-auto flex-1 select-none">
          <div style={{ width, position: "relative" }}>
            {/* header: months + days */}
            <div className="h-12 border-b border-gray-100 relative">
              {months.map((m) => (
                <span key={m.n} className="absolute top-1 text-[11px] font-medium text-gray-600 whitespace-nowrap" style={{ left: (m.n - start) * px + 4 }}>{m.label}</span>
              ))}
              {Array.from({ length: days }, (_, i) => {
                const d = fromNum(start + i);
                const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
                const show = px >= 20 || (px >= 10 && wd === 1) || (px < 10 && d.endsWith("-01"));
                return show ? <span key={i} className="absolute bottom-1 text-[10px] text-gray-400" style={{ left: i * px + 2 }}>{d.slice(8)}</span> : null;
              })}
            </div>
            {/* milestone lane */}
            <div className="h-7 border-b border-gray-100 relative">
              {data.milestones.map((m) => (
                <button key={m.id} title={`${m.name} · ${fmt(m.date)}${m.done ? " (done)" : ""}`} disabled={!data.can_manage}
                  onClick={() => apiRequest(`${base}/milestones/${m.id}`, "PUT", { done: !m.done }).then(load)}
                  className="absolute top-1 flex items-center gap-1 text-[10px] whitespace-nowrap" style={{ left: x(m.date) - 6 }}>
                  <Diamond size={12} className={m.done ? "text-emerald-600 fill-emerald-600" : m.date < today ? "text-rose-600 fill-rose-200" : "text-gray-900 fill-gray-300"} />
                  <span className="text-gray-600">{m.name}</span>
                </button>
              ))}
            </div>
            {/* grid + bars */}
            <div className="relative" style={{ height: Math.max(height, ROW) }}>
              {Array.from({ length: days }, (_, i) => {
                const wd = new Date(`${fromNum(start + i)}T12:00:00Z`).getUTCDay();
                return (wd === 0 || wd === 6) && px >= 10 ? <div key={i} className="absolute top-0 bottom-0 bg-gray-50" style={{ left: i * px, width: px }} /> : null;
              })}
              {data.project.target_date && (
                <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-400" style={{ left: x(data.project.target_date) + px }} title={`Target: ${fmt(data.project.target_date)}`} />
              )}
              <div className="absolute top-0 bottom-0 w-px bg-rose-500" style={{ left: x(today) + px / 2 }} title="Today" />
              {rows.map((t, i) => {
                const b = barOf(t);
                const color = t.status === "Done" ? "bg-emerald-500" : t.late ? "bg-rose-500" : "bg-[var(--viz-1)]";
                return (
                  <div key={t.id} className="absolute" style={{ top: i * ROW + 8, left: b.left, width: b.width, height: ROW - 16 }}>
                    <div onPointerDown={(e) => onDown(e, t, "move")}
                      title={`${t.title}: ${fmt(fromNum(b.s))} → ${fmt(fromNum(b.e))}${t.scheduled ? "" : " (not scheduled yet — drag to plan)"}`}
                      className={`h-full rounded ${color} ${t.scheduled ? "" : "opacity-40"} cursor-grab active:cursor-grabbing`} />
                    <div onPointerDown={(e) => onDown(e, t, "resize")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" />
                  </div>
                );
              })}
              {/* "waits for" arrows */}
              <svg className="absolute inset-0 pointer-events-none" width={width} height={Math.max(height, ROW)}>
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--viz-axis)" /></marker>
                  <marker id="arrow-bad" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#e11d48" /></marker>
                </defs>
                {data.links.map((l) => {
                  const a = rows[indexOf[l.from]];
                  const b = rows[indexOf[l.to]];
                  if (!a || !b) return null;
                  const ba = barOf(a);
                  const bb = barOf(b);
                  const x1 = ba.left + ba.width;
                  const y1 = indexOf[l.from] * ROW + ROW / 2;
                  const x2 = bb.left;
                  const y2 = indexOf[l.to] * ROW + ROW / 2;
                  const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 8));
                  return <path key={`${l.from}-${l.to}`} d={`M${x1},${y1} H${mid} V${y2} H${x2}`} fill="none"
                    stroke={l.clash ? "#e11d48" : "var(--viz-axis)"} strokeWidth="1.5" markerEnd={`url(#${l.clash ? "arrow-bad" : "arrow"})`} />;
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        Drag a bar to move it, drag its right edge to change the due date. Faded bars aren't scheduled yet. Red arrows: a task starts before the one it waits for ends.
      </p>
    </div>
  );
}

// The days to show: project dates, all bars and milestones, and a little around today
function rangeOf(data) {
  const nums = [dayNum(localDate()) - 7, dayNum(localDate()) + 28];
  for (const t of data.tasks) nums.push(dayNum(t.bar_start), dayNum(t.bar_end));
  for (const m of data.milestones) nums.push(dayNum(m.date));
  if (data.project.start_date) nums.push(dayNum(data.project.start_date));
  if (data.project.target_date) nums.push(dayNum(data.project.target_date));
  return { start: Math.min(...nums) - 3, end: Math.max(...nums) + 7 };
}
