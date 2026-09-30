import { useEffect, useState, useCallback } from "react";
import { TrendingUp } from "lucide-react";
import SummaryChart from "./SummaryChart";
import DayModal from "./DayModal";
import CustomCalendar from "./CustomCalender";
import { apiRequest } from "../utils/api";

export default function CalendarDashboard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [monthTasks, setMonthTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const monthKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const fetchMonthTasks = useCallback(async () => {
    try {
      const month = monthKey(currentDate);
      const data = await apiRequest(
        `/tasks?month=${month}`,
        "GET",
        null,
        localStorage.getItem("token")
      );
      setMonthTasks(data || []);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchMonthTasks();
  }, [fetchMonthTasks]);

  const grouped = monthTasks.reduce((acc, t) => {
    const key = t.date_logged;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const changeMonth = (delta) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-1">Track your daily progress at a glance</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Calendar */}
        <div className="flex-1">
          <CustomCalendar
            currentDate={currentDate}
            tasks={monthTasks}
            onDateClick={(date) => {
              setSelectedDate(date);
              setModalOpen(true);
            }}
            onPrev={() => changeMonth(-1)}
            onNext={() => changeMonth(1)}
          />
        </div>

        {/* Sidebar */}
        <div className="lg:w-72 space-y-4">
          {/* Summary chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Monthly Summary</h3>
            </div>
            <SummaryChart tasks={monthTasks} />
          </div>

          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            {[
              ["Total Tasks", monthTasks.length],
              ["Active Days", Object.keys(grouped).length],
              [
                "Avg / Day",
                (monthTasks.length / Math.max(1, Object.keys(grouped).length)).toFixed(1),
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-sm font-semibold text-gray-900">{value}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Legend</h4>
            <div className="space-y-2">
              {[
                ["bg-emerald-400", "Done"],
                ["bg-amber-400", "In Progress"],
                ["bg-rose-400", "Delayed"],
              ].map(([color, label]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-xs text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DayModal
        isOpen={modalOpen}
        date={selectedDate}
        onClose={() => {
          setModalOpen(false);
          setSelectedDate(null);
          fetchMonthTasks();
        }}
      />
    </div>
  );
}