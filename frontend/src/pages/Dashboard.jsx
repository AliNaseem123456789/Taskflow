import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, HourglassMedium, WarningCircle, CalendarCheck, Fire } from "@phosphor-icons/react";
import StatCard from "../components/ui/StatCard";
import { getStoredUser } from "../api/api";
import { apiRequest } from "../utils/api";
import Heatmap from "../components/Heatmap";
import GoalBar from "../components/GoalBar";
import { localMonth } from "../utils/date";
import UnreadAnnouncements from "../components/UnreadAnnouncements";
import AreaTile from "../components/AreaTile";

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
    { label: "Completed",   value: stats.done,    icon: CheckCircle,     hue: "teal" },
    { label: "In progress", value: stats.doing,   icon: HourglassMedium, hue: "amber" },
    { label: "Delayed",     value: stats.delayed, icon: WarningCircle,   hue: "rose" },
    { label: "This month",  value: stats.total,   icon: CalendarCheck,   hue: "indigo" },
  ];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (getStoredUser()?.name || "").split(" ")[0];

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title"><AreaTile />{greeting}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {streak > 0 && (
          <div className="flex items-center gap-3 bg-white border border-amber-200 rounded-xl pl-2 pr-4 py-2">
            <span className="tile tile-amber w-10 h-10"><Fire size={24} weight="fill" /></span>
            <div>
              <p className="font-display text-lg font-bold text-gray-900 leading-tight">{streak}-day streak</p>
              <p className="text-xs text-amber-700">Log something today to keep it going</p>
            </div>
          </div>
        )}
      </div>

      <UnreadAnnouncements />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Completion bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-900">Monthly completion</span>
          <span className="font-display text-2xl font-bold text-gray-900">{completionRate}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full btn-accent rounded-full transition-all duration-500"
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
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-900">Goals</span>
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
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-gray-900">Recent activity</h2>
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
