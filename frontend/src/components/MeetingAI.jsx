import { useState } from "react";
import { Sparkles } from "lucide-react";
import { apiRequest } from "../utils/api";
import { aiRequest, useAI } from "../utils/ai";

const box = "border border-gray-200 rounded-lg bg-white p-4 space-y-2";

// AI on a meeting: notes -> summary, decisions and action items; retro cards -> themes.
// Suggestions only; you pick what gets added.
export default function MeetingAI({ meeting, onChanged }) {
  const ai = useAI();
  const [notes, setNotes] = useState(null);
  const [retro, setRetro] = useState(null);
  const [keep, setKeep] = useState({});
  const [state, setState] = useState("");
  if (!ai.on || !meeting.can_note) return null;
  const opts = { company: meeting.company_id };

  const run = async (fn) => {
    setState("Thinking…");
    try {
      await fn();
      setState("");
    } catch (err) {
      setState(err.message);
    }
  };
  const pickAll = (n, prefix) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, true]));

  const extract = () => run(async () => {
    const d = await aiRequest("/api/meetings/extract", { meeting_id: meeting.id }, opts);
    if (d.note) throw new Error(d.note);
    setKeep({ ...pickAll(d.decisions.length, "d"), ...pickAll(d.actions.length, "a"), summary: !!d.summary });
    setNotes(d);
  });
  const themes = () => run(async () => {
    const d = await aiRequest("/api/meetings/retro-themes", { meeting_id: meeting.id }, opts);
    if (d.note) throw new Error(d.note);
    setKeep(pickAll(d.actions.length, "r"));
    setRetro(d);
  });

  const addItems = async (items) => {
    for (const it of items) await apiRequest(`/meetings/${meeting.id}/items`, "POST", it).catch(() => {});
  };
  const applyNotes = () => run(async () => {
    await addItems([
      ...notes.decisions.filter((_, i) => keep[`d${i}`]).map((text) => ({ kind: "decision", text })),
      ...notes.actions.filter((_, i) => keep[`a${i}`]).map((a) => ({ kind: "action", text: a.text, assignee_id: a.assignee_id, due_date: a.due_date })),
    ]);
    if (keep.summary && notes.summary)
      await apiRequest(`/meetings/${meeting.id}`, "PUT", { notes: `Summary: ${notes.summary}\n\n${meeting.notes || ""}`.trim() });
    setNotes(null);
    onChanged();
  });
  const applyRetro = () => run(async () => {
    await addItems(retro.actions.filter((_, i) => keep[`r${i}`]).map((a) => ({ kind: "action", text: a.text, assignee_id: a.assignee_id })));
    setRetro(null);
    onChanged();
  });

  const tick = (key, label, sub) => (
    <label key={key} className="flex items-start gap-2 text-sm text-gray-800">
      <input type="checkbox" className="mt-1" checked={!!keep[key]} onChange={() => setKeep({ ...keep, [key]: !keep[key] })} />
      <span>{label}{sub && <span className="text-xs text-gray-400"> · {sub}</span>}</span>
    </label>
  );

  return (
    <div className="space-y-3">
      {!notes && !retro && (
        <div className="flex flex-wrap gap-3">
          <button onClick={extract} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
            <Sparkles size={12} /> Pull decisions & actions from the notes
          </button>
          {meeting.kind === "retro" && (
            <button onClick={themes} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
              <Sparkles size={12} /> Find themes in the cards
            </button>
          )}
          {state && <span className="text-xs text-gray-500 self-center">{state}</span>}
        </div>
      )}

      {notes && (
        <div className={box}>
          <p className="text-xs font-medium text-gray-600 flex items-center gap-1"><Sparkles size={12} /> From the notes — tick what to add</p>
          {notes.summary && tick("summary", `Add summary to notes: “${notes.summary}”`)}
          {notes.decisions.length > 0 && <p className="text-xs text-gray-500 pt-1">Decisions</p>}
          {notes.decisions.map((d, i) => tick(`d${i}`, d))}
          {notes.actions.length > 0 && <p className="text-xs text-gray-500 pt-1">Action items</p>}
          {notes.actions.map((a, i) => tick(`a${i}`, a.text, [a.assignee_name, a.due_date && `due ${a.due_date}`].filter(Boolean).join(" · ")))}
          {notes.open_questions.length > 0 && <p className="text-xs text-amber-700 pt-1">Still open: {notes.open_questions.join("; ")}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={applyNotes} className="px-3 py-1.5 btn-accent text-xs rounded-md">Add selected</button>
            <button onClick={() => setNotes(null)} className="px-3 py-1.5 text-xs text-gray-500">Dismiss</button>
            {state && <span className="text-xs text-gray-500 self-center">{state}</span>}
          </div>
        </div>
      )}

      {retro && (
        <div className={box}>
          <p className="text-xs font-medium text-gray-600 flex items-center gap-1"><Sparkles size={12} /> Themes</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {retro.themes.map((t) => (
              <div key={t.name} className={`rounded-md p-2 text-xs ${t.tone === "good" ? "bg-emerald-50" : t.tone === "bad" ? "bg-rose-50" : "bg-gray-50"}`}>
                <p className="font-semibold text-gray-900">{t.name} <span className="font-normal text-gray-500">· {t.cards.length} cards, {t.votes} votes</span></p>
                <p className="text-gray-600 mt-0.5">{t.cards.join(" · ")}</p>
              </div>
            ))}
          </div>
          {retro.actions.length > 0 && <p className="text-xs text-gray-500 pt-1">Suggested actions</p>}
          {retro.actions.map((a, i) => tick(`r${i}`, a.text, a.assignee_name))}
          <div className="flex gap-2 pt-1">
            {retro.actions.length > 0 && <button onClick={applyRetro} className="px-3 py-1.5 btn-accent text-xs rounded-md">Add as action items</button>}
            <button onClick={() => setRetro(null)} className="px-3 py-1.5 text-xs text-gray-500">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
