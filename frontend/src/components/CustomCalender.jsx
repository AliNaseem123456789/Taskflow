import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDate } from "../utils/date";

export default function CustomCalendar({ currentDate, tasks, onDateClick, onPrev, onNext }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = localDate();

  const paddingDays = Array(firstDay).fill(null);
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const allDays = [...paddingDays, ...monthDays];

  const getDateStr = (day) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const statusColor = {
    Done: "bg-emerald-400",
    Doing: "bg-amber-400",
    Delayed: "bg-rose-400",
  };

  const getDots = (day) => {
    const dateStr = getDateStr(day);
    const dayTasks = tasks.filter((t) => t.date_logged === dateStr);
    if (!dayTasks.length) return null;
    return (
      <div className="flex flex-wrap justify-center gap-0.5 mt-1.5">
        {dayTasks
          .sort((a, b) => a.status.localeCompare(b.status))
          .slice(0, 6)
          .map((t, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${statusColor[t.status] || "bg-gray-300"}`}
              title={`${t.status}: ${t.title}`}
            />
          ))}
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onPrev}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-sm font-semibold text-gray-900">
          {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
        </h2>
        <button
          onClick={onNext}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider py-2"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {allDays.map((day, i) => {
          const dateStr = day ? getDateStr(day) : "";
          const isToday = dateStr === today;
          return (
            <div
              key={i}
              onClick={() =>
                day && onDateClick(new Date(year, month, day))
              }
              className={`min-h-[80px] p-1.5 border-t border-gray-100 transition-colors ${
                day
                  ? "cursor-pointer hover:bg-gray-50"
                  : "bg-gray-50/50"
              }`}
            >
              {day && (
                <>
                  <span
                    className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday
                        ? "bg-gray-900 text-white"
                        : "text-gray-600"
                    }`}
                  >
                    {day}
                  </span>
                  {getDots(day)}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}