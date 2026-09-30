import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Clock, AlertTriangle, TrendingUp, Flame } from "lucide-react";
import { apiRequest } from "../utils/api";
import Heatmap from "../components/Heatmap";
import GoalBar from "../components/GoalBar";
import { localMonth } from "../utils/date";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ done: 0, doing: 0, delayed: 0, total: 0 });
  const [recentTasks, setRecentTasks] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);


  useEffect(() => {

    const fetchAll = async () => {
      try {
        const month = localMonth();

        const [tasks, streakData, goalList] = await Promise.all([
          apiRequest(`/tasks?month=${month}`, "GET", null),
          apiRequest("/tasks/streak", "GET", null).catch(() => ({ streak: 0 })),
          apiRequest("/goals").catch(() => []),
        ]);
        setGoals(goalList);

        setStreak(streakData.streak || 0);
        setStats({
          done: tasks.filter((t) => t.status === "Done").length,
          doing: tasks.filter((t) => t.status === "Doing").length,
          delayed: tasks.filter((t) => t.status === "Delayed").length,
          total: tasks.length,
        });
        setRecentTasks(
          [...tasks]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 8)
        );
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [navigate]);

  const statCards = [
    { label: "Completed",   value: stats.done,    icon: CheckSquare,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "In Progress", value: stats.doing,   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50"   },
    { label: "Delayed",     value: stats.delayed, icon: AlertTriangle, color: "text-rose-600",   bg: "bg-rose-50"    },
    { label: "This Month",  value: stats.total,   icon: TrendingUp,   color: "text-gray-600",    bg: "bg-gray-50"    },
  ];

  const completionRate = stats.total
    ? Math.round((stats.done / stats.total) * 100)
    : 0;

  const statusBadge = (status) =>
    ({
      Done:    "bg-emerald-50 text-emerald-700",
      Doing:   "bg-amber-50 text-amber-700",
      Delayed: "bg-rose-50 text-rose-700",
    }[status] || "bg-gray-50 text-gray-700");

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
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Streak badge */}
        {streak > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Flame size={16} className="text-amber-500" />
            <div>
              <p className="text-sm font-bold text-gray-900">{streak}-day streak</p>
              <p className="text-[10px] text-amber-600">Keep it up!</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
              <div className={`${bg} p-1.5 rounded`}>
                <Icon size={14} className={color} />
              </div>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Completion bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Monthly completion</span>
          <span className="text-sm font-semibold text-gray-900">{completionRate}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
        {streak > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            🔥 You've logged tasks for {streak} day{streak !== 1 ? "s" : ""} in a row.
          </p>
        )}
      </div>

      {/* Goals */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700">Goals</span>
          <button onClick={() => navigate("/goals")} className="text-xs text-gray-500 hover:text-gray-900 font-medium">
            {goals.length ? "Manage" : "Set a goal"}
          </button>
        </div>
        {goals.length === 0 ? (
          <p className="text-sm text-gray-400">No goals yet — e.g. "Finish 10 tasks this week".</p>
        ) : (
          <div className="space-y-4">
            {goals.map((g) => <GoalBar key={g.id} goal={g} />)}
          </div>
        )}
      </div>

      <Heatmap />

      {/* Recent tasks */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
          <button
            onClick={() => navigate("/mydones")}
            className="text-xs text-gray-500 hover:text-gray-900 font-medium transition-colors"
          >
            View all
          </button>
        </div>
        {recentTasks.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-400">No tasks yet this month.</p>
            <button
              onClick={() => navigate("/mydones")}
              className="mt-3 text-sm text-gray-900 font-medium hover:underline"
            >
              Log your first task
            </button>
          </div>
        ) : (
          <ul>
            {recentTasks.map((task) => (
              <li
                key={task.id}
                className="px-5 py-3 flex items-center justify-between border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm text-gray-900 truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-gray-400">{task.date_logged}</p>
                    {task.tags?.map((tag) => (
                      <span
                        key={tag.id}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(task.status)}`}>
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
