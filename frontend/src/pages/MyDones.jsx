import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import ExportMenu from "../components/ExportMenu";
import { exportJSON, exportCSV, exportPDF } from "../utils/export";
import AddTaskForm from "../components/AddTaskForm";
import TaskList from "../components/TaskList";
import { apiRequest } from "../utils/api";
import { localDate } from "../utils/date";
import { getWorkspace, getStoredUser } from "../api/api";

export default function MyDones() {
  const [tasks, setTasks] = useState([]);
  const [currentDateObj, setCurrentDateObj] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState("All");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // "n" shortcut opens this page with ?new=1
  useEffect(() => {
    if (searchParams.get("new")) {
      setShowAddForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const dateStr = localDate(currentDateObj);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        // in a company, My Dones = company work assigned to me
        const mine = getWorkspace() ? "&assignee=me" : "";
        const data = await apiRequest(`/tasks?date=${dateStr}${mine}`, "GET", null);
        setTasks(data);
      } catch (err) {
        console.error("Fetch tasks failed:", err.message);
      }
    };
    fetchTasks();
  }, [dateStr]);

  const changeDate = (days) => {
    setCurrentDateObj((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const handleAdd = async (title, tags = [], _date, extra = {}) => {
    try {
      const newTask = await apiRequest("/tasks", "POST", {
        status: "Done",
        ...extra,
        title,
        tags,
        date_logged: dateStr,
      });
      if (!newTask.assignee_id || newTask.assignee_id === getStoredUser()?.id)
        setTasks((prev) => [newTask, ...prev]);
      setShowAddForm(false);
    } catch (err) {
      console.error("Failed to add task:", err.message);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const updated = await apiRequest(`/tasks/${id}`, "PUT", { status });
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: updated.status } : t))
      );
    } catch (err) {
      console.error("Failed to update:", err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiRequest(`/tasks/${id}`, "DELETE", null);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err.message);
    }
  };

  const handleUpdate = (updated) => {
    // moved to another day -> drop it from this list
    setTasks((prev) =>
      updated.date_logged === dateStr
        ? prev.map((t) => (t.id === updated.id ? updated : t))
        : prev.filter((t) => t.id !== updated.id)
    );
  };

  const handleExport = (format) => {
    const name = `mydones_${dateStr}`;
    if (format === "csv") exportCSV(filteredTasks, name);
    else if (format === "pdf") exportPDF(filteredTasks, name, `My Dones — ${dateStr}`);
    else exportJSON(filteredTasks, name);
  };

  const filteredTasks =
    statusFilter === "All" ? tasks : tasks.filter((t) => t.status === statusFilter);

  const filters = ["All", "Done", "Doing", "Delayed"];

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">
            {currentDateObj.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h1>
          <div className="flex items-center border border-gray-200 rounded-md">
            <button
              onClick={() => changeDate(-1)}
              className="p-1.5 hover:bg-gray-50 text-gray-500 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <button
              onClick={() => changeDate(1)}
              className="p-1.5 hover:bg-gray-50 text-gray-500 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ExportMenu onExport={handleExport} />
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          >
            <Plus size={13} />
            Add task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 mb-5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              statusFilter === f
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-2 text-xs text-gray-400">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddTaskForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* Task list */}
      <div className="bg-white border border-gray-200 rounded-lg p-2">
        <TaskList
          tasks={filteredTasks}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      </div>
    </div>
  );
}
