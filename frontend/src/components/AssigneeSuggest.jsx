import { useState } from "react";
import { Sparkles } from "lucide-react";
import { aiRequest, useAI } from "../utils/ai";

// "Who should do this?" — asks the AI (skills, workload, time off), shows up to 3 people to pick from
export default function AssigneeSuggest({ getInput, onPick, company }) {
  const ai = useAI();
  const [state, setState] = useState({ loading: false, items: null, error: "" });
  if (!ai.on) return null;

  const ask = async () => {
    const input = getInput();
    if (!input.task_id && !input.title?.trim()) return setState({ loading: false, items: null, error: "Write a title first" });
    setState({ loading: true, items: null, error: "" });
    try {
      const out = await aiRequest("/api/tasks/suggest-assignee", input, company !== undefined ? { company } : {});
      setState({ loading: false, items: out.suggestions, error: out.suggestions.length ? "" : out.note || "No suggestion" });
    } catch (err) {
      setState({ loading: false, items: null, error: err.message });
    }
  };

  return (
    <div className="col-span-full">
      <button type="button" onClick={ask} disabled={state.loading}
        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 disabled:opacity-50">
        <Sparkles size={11} /> {state.loading ? "Thinking…" : "Who should do this?"}
      </button>
      {state.error && <p className="text-[11px] text-gray-400 mt-1">{state.error}</p>}
      {state.items?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {state.items.map((s) => (
            <button key={s.user_id} type="button" title={s.reason}
              onClick={() => { onPick(s.user_id); setState({ loading: false, items: null, error: "" }); }}
              className="text-left text-[11px] px-2 py-1 rounded-md border border-gray-200 hover:border-indigo-600 bg-white max-w-[260px]">
              <span className="font-medium text-gray-900">{s.name}</span>
              <span className="text-gray-500"> — {s.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
