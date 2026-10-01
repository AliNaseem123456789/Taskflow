import { useCallback, useEffect, useState } from "react";
import { Wand2, Sparkles } from "lucide-react";
import { aiRequest, useAI } from "../../utils/ai";
import { apiRequest } from "../../utils/api";
import { getStoredUser } from "../../api/api";
import { useLiveEvent } from "../../utils/live";
import { localDate } from "../../utils/date";

const QUESTIONS = [
  ["yesterday", "What did you do yesterday?"],
  ["today", "What will you do today?"],
  ["blockers", "Anything blocking you?"],
];
const areaCls =
  "w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white min-h-[64px]";

// Daily standup: post your own answers, read everyone else's
export default function StandupTab({ team, date }) {
  const me = getStoredUser();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ yesterday: "", today: "", blockers: "" });
  const [status, setStatus] = useState("");
  const isToday = date === localDate();

  const load = useCallback(
    () =>
      apiRequest(`/teams/${team.id}/standups?date=${date}`)
        .then((d) => {
          setData(d);
          const mine = d.members.find((m) => m.id === me?.id)?.standup;
          setForm({ yesterday: mine?.yesterday || "", today: mine?.today || "", blockers: mine?.blockers || "" });
        })
        .catch(() => setData({ members: [] })),
    [team.id, date, me?.id]
  );

  useEffect(() => { load(); }, [load]);
  useLiveEvent("standup", load);

  const ai = useAI();
  // AI writes a readable standup from your tasks (you edit before posting)
  const writeWithAI = async () => {
    setStatus("Writing…");
    try {
      const d = await aiRequest("/api/standup/draft", { kind: "standup", team_id: team.id });
      if (d.empty) return setStatus("No recent tasks to write from.");
      setForm({ yesterday: d.yesterday || "", today: d.today || "", blockers: d.blockers || "" });
      setStatus("Drafted — edit and post.");
    } catch (err) {
      setStatus(err.message);
    }
  };

  const fillFromTasks = async () => {
    const draft = await apiRequest(`/teams/${team.id}/standups/draft`).catch(() => null);
    if (draft && !draft.yesterday && !draft.today && !draft.blockers) {
      setStatus("No recent tasks to fill from — write it yourself.");
      return;
    }
    if (draft)
      setForm((f) => ({
        yesterday: f.yesterday || draft.yesterday,
        today: f.today || draft.today,
        blockers: f.blockers || draft.blockers,
      }));
  };

  const save = async (e) => {
    e.preventDefault();
    setStatus("Saving…");
    try {
      await apiRequest(`/teams/${team.id}/standups`, "PUT", { ...form, date });
      setStatus("Posted");
      load();
    } catch (err) {
      setStatus(err.message);
    }
  };

  if (!data) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;
  const others = data.members.filter((m) => m.id !== me?.id);
  const missing = others.filter((m) => !m.standup);

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-bold text-gray-900">Your standup {isToday ? "today" : `for ${date}`}</h2>
          <button type="button" onClick={fillFromTasks} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900" title="Fill empty answers from your tasks">
            <Wand2 size={12} /> Fill from my tasks
          </button>
          {ai.on && isToday && (
            <button type="button" onClick={writeWithAI} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
              <Sparkles size={12} /> Write it with AI
            </button>
          )}
        </div>
        {QUESTIONS.map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <textarea className={areaCls} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 btn-accent text-sm rounded-md">Post standup</button>
          {status && <span className="text-xs text-gray-500">{status}</span>}
        </div>
      </form>

      <div className="space-y-3">
        {others.filter((m) => m.standup).map((m) => (
          <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">{m.name || m.email}</p>
            {QUESTIONS.map(([key, label]) =>
              m.standup[key] ? (
                <div key={key} className="mb-2 last:mb-0">
                  <p className="text-[11px] text-gray-400">{label}</p>
                  <p className={`text-sm whitespace-pre-wrap ${key === "blockers" ? "text-amber-700" : "text-gray-700"}`}>{m.standup[key]}</p>
                </div>
              ) : null
            )}
          </div>
        ))}
        {missing.length > 0 && (
          <p className="text-xs text-gray-400">
            Not posted yet: {missing.map((m) => m.name || m.email).join(", ")}
          </p>
        )}
        {others.length === 0 && <p className="text-sm text-gray-400">You're the only member so far.</p>}
      </div>
    </div>
  );
}
