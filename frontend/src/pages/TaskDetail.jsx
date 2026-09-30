import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TaskList from "../components/TaskList";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";

// One task with its comments open. Notification links land here.
export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [error, setError] = useState("");
  const isMine = task && task.user_id === getStoredUser()?.id;

  useEffect(() => {
    setTask(null);
    apiRequest(`/tasks/${id}`)
      .then(setTask)
      .catch((err) => setError(err.message));
  }, [id]);

  const changeStatus = async (taskId, status) => {
    const updated = await apiRequest(`/tasks/${taskId}`, "PUT", { status }).catch(() => null);
    if (updated) setTask((t) => ({ ...t, ...updated }));
  };

  const remove = async (taskId) => {
    await apiRequest(`/tasks/${taskId}`, "DELETE").catch(() => {});
    navigate("/mydones");
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-5"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {error && <p className="text-sm text-gray-500">{error}</p>}
      {!task && !error && (
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      )}

      {task && (
        <>
          <p className="text-xs text-gray-400 mb-2">
            {isMine ? "Your task" : `${task.owner?.name || task.owner?.email}'s task`} · logged {task.date_logged}
          </p>
          {task.description && (
            <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{task.description}</p>
          )}
          <div className="bg-white border border-gray-200 rounded-lg">
            <TaskList
              tasks={[task]}
              showComments
              onStatusChange={isMine ? changeStatus : undefined}
              onDelete={isMine ? remove : undefined}
              onUpdate={isMine ? (u) => setTask((t) => ({ ...t, ...u })) : undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}
