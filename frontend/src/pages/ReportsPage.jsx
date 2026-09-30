import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import ExportMenu from "../components/ExportMenu";
import { exportJSON, exportCSV, exportPDF } from "../utils/export";
import { apiRequest } from "../utils/api";
import api from "../api/api";
import { localDate } from "../utils/date";

// Optional external AI service (set VITE_AI_API_URL in frontend/.env)
const AI_API_URL = import.meta.env.VITE_AI_API_URL;

export default function ReportsPage({ userId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange] = useState({ startDate: null, endDate: null });

  const getUserId = useCallback(() => {
    if (userId) return userId;
    try {
      const user = localStorage.getItem("user");
      if (user) {
        const d = JSON.parse(user);
        return d.id || d.user_id;
      }
    } catch {}
    return null;
  }, [userId]);

  const fetchTasks = useCallback(async () => {
    const uid = getUserId();
    if (!uid) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      let url = `/tasks?user_id=${uid}`;
      if (dateRange.startDate) url += `&start_date=${dateRange.startDate}`;
      if (dateRange.endDate) url += `&end_date=${dateRange.endDate}`;
      const data = await apiRequest(url, "GET", null);
      setTasks(data || []);
    } catch {
      setError("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [getUserId, dateRange]);

  const fetchAISummary = useCallback(async () => {
    const uid = getUserId();
    if (!uid || !tasks.length) return;
    try {
      setSummaryLoading(true);
      if (!AI_API_URL) throw new Error("No AI service configured");
      const { data } = await api.post(`${AI_API_URL}/api/ai-summary`, {
        user_id: uid,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });
      setAiSummary(data);
    } catch {
      // Fallback
      const dones = tasks.filter((t) => t.status === "Done");
      const doing = tasks.filter((t) => t.status === "Doing");
      const delayed = tasks.filter((t) => t.status === "Delayed");
      setAiSummary({
        summary: `You completed ${dones.length} tasks, with ${doing.length} in progress and ${delayed.length} delayed.`,
        insights: {
          dones: dones.map((t) => t.title),
          doing: doing.map((t) => t.title),
          delayed: delayed.map((t) => t.title),
        },
        recommendations: [
          { title: "Tip", text: delayed.length > 0
              ? `Focus on your ${delayed.length} delayed task(s).`
              : "Keep up the momentum!" },
        ],
        stats: {
          total_tasks: tasks.length,
          completion_rate: tasks.length ? Math.round((dones.length / tasks.length) * 100) : 0,
          delayed_count: delayed.length,
        },
      });
    } finally {
      setSummaryLoading(false);
    }
  }, [getUserId, tasks, dateRange]);

  useEffect(() => {
    if (getUserId()) fetchTasks();
    else setLoading(false);
  }, [getUserId, fetchTasks]);

  useEffect(() => {
    if (tasks.length > 0 && getUserId()) fetchAISummary();
  }, [tasks, getUserId, fetchAISummary]);

  const handleExport = (format) => {
    const name = `report-${localDate()}`;
    if (format === "csv") exportCSV(tasks, name);
    else if (format === "pdf")
      exportPDF(tasks, name, "Productivity report", aiSummary?.summary ? [aiSummary.summary] : []);
    else exportJSON({ tasks, ai_summary: aiSummary, generated: new Date().toISOString() }, name);
  };

  const statusBadge = {
    Done: "bg-emerald-50 text-emerald-700",
    Doing: "bg-amber-50 text-amber-700",
    Delayed: "bg-rose-50 text-rose-700",
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered productivity insights</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTasks}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <ExportMenu
            onExport={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {/* AI Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">AI Summary</h2>
          {summaryLoading && (
            <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          )}
        </div>
        {aiSummary ? (
          <>
            <p className="text-sm text-gray-700 leading-relaxed mb-5 whitespace-pre-wrap">
              {aiSummary.summary}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                ["Completion", `${aiSummary.stats?.completion_rate || 0}%`, "text-emerald-600"],
                ["Total Tasks", aiSummary.stats?.total_tasks || 0, "text-gray-900"],
                ["Delayed", aiSummary.stats?.delayed_count || 0, "text-rose-600"],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-gray-50 rounded-md p-3 text-center">
                  <p className={`text-xl font-semibold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">
            {tasks.length === 0 ? "No tasks to analyze." : "Loading insights..."}
          </p>
        )}
      </div>

      {/* Task breakdown + recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Task Breakdown</h3>
          {[
            ["Done", aiSummary?.insights?.dones || tasks.filter((t) => t.status === "Done").map((t) => t.title), "emerald"],
            ["Doing", aiSummary?.insights?.doing || tasks.filter((t) => t.status === "Doing").map((t) => t.title), "amber"],
            ["Delayed", aiSummary?.insights?.delayed || tasks.filter((t) => t.status === "Delayed").map((t) => t.title), "rose"],
          ].map(([title, items, color]) => (
            <div
              key={title}
              className={`bg-${color}-50 border border-${color}-100 rounded-md p-4`}
            >
              <h4 className={`text-xs font-semibold text-${color}-700 mb-2`}>
                {title} ({items.length})
              </h4>
              {items.length > 0 ? (
                <ul className="space-y-1 max-h-40 overflow-auto">
                  {items.map((item, i) => (
                    <li key={i} className={`text-xs text-${color}-800`}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`text-xs text-${color}-400`}>None</p>
              )}
            </div>
          ))}
        </div>

        {/* Recommendations */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 h-fit">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recommendations</h3>
          <div className="space-y-3">
            {(aiSummary?.recommendations || []).map((rec, i) => (
              <div key={i} className="bg-gray-50 rounded-md p-3">
                <p className="text-xs font-semibold text-gray-900 mb-1">{rec.title}</p>
                <p className="text-xs text-gray-600">{rec.text}</p>
              </div>
            ))}
            {(!aiSummary?.recommendations || aiSummary.recommendations.length === 0) && (
              <p className="text-xs text-gray-400 py-4 text-center">
                Add more tasks to get personalized recommendations.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
