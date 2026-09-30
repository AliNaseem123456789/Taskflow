import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#10b981", "#f59e0b", "#f43f5e"];

export default function SummaryChart({ tasks = [] }) {
  const counts = {
    Done: tasks.filter((t) => t.status === "Done").length,
    Doing: tasks.filter((t) => t.status === "Doing").length,
    Delayed: tasks.filter((t) => t.status === "Delayed").length,
  };

  const data = [
    { name: "Done", value: counts.Done },
    { name: "Doing", value: counts.Doing },
    { name: "Delayed", value: counts.Delayed },
  ];

  const total = counts.Done + counts.Doing + counts.Delayed;

  if (total === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-gray-400">No data this month</p>
      </div>
    );
  }

  const legend = [
    { label: "Done", count: counts.Done, color: "bg-emerald-400" },
    { label: "Doing", count: counts.Doing, color: "bg-amber-400" },
    { label: "Delayed", count: counts.Delayed, color: "bg-rose-400" },
  ];

  return (
    <div>
      <div className="flex justify-center">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                boxShadow: "none",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        {legend.map(({ label, count, color }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-gray-600 text-xs">{label}</span>
            </div>
            <span className="text-xs font-medium text-gray-900">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}