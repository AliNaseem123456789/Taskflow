import { useEffect, useState } from "react";
import { apiRequest } from "../utils/api";

const LABELS = {
  chat: "Assistant chat", summary: "Report summaries", breakdown: "Task breakdowns", quick_add: "Tasks from a sentence",
  suggest_assignee: "Who should do it", handover: "Hand-over notes", meeting_notes: "Meeting notes → actions",
  retro_themes: "Retro themes", project_update: "Project update drafts", standup: "Standup drafts",
  wiki_answer: "Ask the wiki", solve_problem: "Solve a team problem",
};

// Admins: how much AI the company used (requests count toward the daily limits)
export default function AiUsage({ company }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest(`/companies/${company.id}/ai-usage`).then(setData).catch((err) => setError(err.message));
  }, [company.id]);
  if (error) return <p className="text-sm text-gray-500">{error}</p>;
  if (!data) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        {[["Today", `${data.requests_today} / ${data.limit_company}`, "company daily limit"],
          ["Last 30 days", data.requests_30d, "requests"],
          ["Per person", data.limit_user, "requests a day"]].map(([label, value, note]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
            <p className="text-[11px] text-gray-400">{note}</p>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          <p className="px-4 py-2 text-xs font-medium text-gray-500">By feature (30 days)</p>
          {data.by_feature.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No AI used yet.</p>}
          {data.by_feature.map((f) => (
            <div key={f.feature} className="px-4 py-2 flex justify-between text-sm">
              <span className="text-gray-700">{LABELS[f.feature] || f.feature}</span>
              <span className="text-gray-900 font-medium">{f.requests}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          <p className="px-4 py-2 text-xs font-medium text-gray-500">By person (30 days)</p>
          {data.by_person.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No AI used yet.</p>}
          {data.by_person.map((p) => (
            <div key={p.id} className="px-4 py-2 flex justify-between text-sm">
              <span className="text-gray-700">{p.name || p.email}</span>
              <span className="text-gray-900 font-medium">{p.requests}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">Limits are set on the server (AI_DAILY_LIMIT_USER, AI_DAILY_LIMIT_COMPANY). The AI only reads what the person asking can see.</p>
    </div>
  );
}
