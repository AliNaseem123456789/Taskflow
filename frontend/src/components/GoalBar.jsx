// One goal with its progress bar. `goal` comes from /goals or /teams/:id/goals.
export default function GoalBar({ goal, actions }) {
  const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
  const done = goal.progress >= goal.target;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-sm text-gray-900 truncate">{goal.title}</span>
          {goal.tags && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white shrink-0"
              style={{ backgroundColor: goal.tags.color }}
            >
              {goal.tags.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold ${done ? "text-emerald-600" : "text-gray-700"}`}>
            {goal.progress}/{goal.target}
          </span>
          <span className="text-[10px] text-gray-400">this {goal.period}</span>
          {actions}
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-500" : "btn-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
