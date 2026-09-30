import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiRequest } from "../utils/api";

export default function DayModal({ isOpen, date, onClose }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const dateKey = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;

  useEffect(() => {
    if (!isOpen || !dateKey) return;
    const fetchForDate = async () => {
      try {
        setLoading(true);
        const data = await apiRequest(
          `/tasks?date=${dateKey}`,
          "GET",
          null,
          localStorage.getItem("token")
        );
        setTasks(data || []);
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    fetchForDate();
  }, [isOpen, dateKey]);

  const updateStatus = async (taskId, newStatus) => {
    try {
      const updated = await apiRequest(
        `/tasks/${taskId}`,
        "PUT",
        { status: newStatus },
        localStorage.getItem("token")
      );
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm("Delete this task?")) return;
    try {
      await apiRequest(`/tasks/${taskId}`, "DELETE", null, localStorage.getItem("token"));
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  if (!isOpen) return null;

  const statusBadge = {
    Done: "bg-emerald-50 text-emerald-700",
    Doing: "bg-amber-50 text-amber-700",
    Delayed: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white max-w-lg w-full rounded-lg shadow-xl z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {date?.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No tasks logged for this date.
            </p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between p-3 rounded-md border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-gray-900">{t.title}</p>
                    {t.description && (
                      <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <select
                      value={t.status}
                      onChange={(e) => updateStatus(t.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-md border-0 cursor-pointer ${
                        statusBadge[t.status] || "bg-gray-50"
                      }`}
                    >
                      <option>Doing</option>
                      <option>Done</option>
                      <option>Delayed</option>
                    </select>
                    <button
                      onClick={() => deleteTask(t.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}