import { useEffect, useState } from "react";
import { apiRequest } from "../utils/api";
import { parseLocalDate, shiftDate } from "../utils/date";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// One green at different strengths, so it reads in light and dark mode
const LEVEL_ALPHA = [0, 0.3, 0.55, 0.8, 1];
const level = (count) => (count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4);

// Month name above the first week of each month. Skips a label that would
// sit less than 3 columns before the next one (so they never overlap).
const monthLabels = (weeks) => {
  const months = weeks.map((w) => parseLocalDate(w.find(Boolean)).getMonth());
  const starts = months.map((m, i) => i === 0 || m !== months[i - 1]);
  return months.map((m, i) => {
    if (!starts[i]) return "";
    const next = starts.findIndex((s, j) => j > i && s);
    return next !== -1 && next - i < 3 ? "" : MONTHS[m];
  });
};

// GitHub-style grid of Done tasks per day for the last year.
export default function Heatmap() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiRequest("/tasks/heatmap?days=365").then(setData).catch(() => setData({ days: [] }));
  }, []);

  if (!data?.start) return null;

  const counts = Object.fromEntries(data.days.map((d) => [d.date, d.count]));
  const total = data.days.reduce((sum, d) => sum + d.count, 0);

  // Start on the Sunday on/before the first day so rows line up with weekdays
  let cursor = shiftDate(data.start, -parseLocalDate(data.start).getDay());
  const weeks = [];
  while (cursor <= data.end) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor >= data.start && cursor <= data.end ? cursor : null);
      cursor = shiftDate(cursor, 1);
    }
    weeks.push(week);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Activity</span>
        <span className="text-xs text-gray-400">{total} tasks done in the last year</span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {/* month labels */}
          <div className="flex gap-[3px] text-[9px] text-gray-400 h-3">
            {monthLabels(weeks).map((label, i) => (
              <span key={i} className="w-[11px] overflow-visible whitespace-nowrap">{label}</span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {week.map((day, j) => {
                  if (!day) return <span key={j} className="w-[11px] h-[11px]" />;
                  const c = counts[day] || 0;
                  const lv = level(c);
                  return (
                    <span
                      key={j}
                      title={`${day}: ${c} done`}
                      className={`w-[11px] h-[11px] rounded-[2px] ${lv === 0 ? "bg-gray-100" : ""}`}
                      style={lv ? { backgroundColor: `rgba(16, 185, 129, ${LEVEL_ALPHA[lv]})` } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-gray-400">
        Less
        {LEVEL_ALPHA.map((a, i) => (
          <span
            key={i}
            className={`w-[10px] h-[10px] rounded-[2px] ${i === 0 ? "bg-gray-100" : ""}`}
            style={i ? { backgroundColor: `rgba(16, 185, 129, ${a})` } : undefined}
          />
        ))}
        More
      </div>
    </div>
  );
}
