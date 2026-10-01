import { useState } from "react";
import { CheckCircle, Clock, XCircle, Trash2, ThumbsUp, MessageCircle, ChevronDown, Pencil } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";
import CommentPanel from "./CommentPanel";
import TaskMeta from "./TaskMeta";
import TaskEditModal from "./TaskEditModal";
import EmptyState from "./ui/EmptyState";
import { CheckSquareOffset } from "@phosphor-icons/react";

const STATUS = {
  Done:    { icon: CheckCircle, active: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" },
  Doing:   { icon: Clock,        active: "text-amber-500",   badge: "bg-amber-50 text-amber-700"   },
  Delayed: { icon: XCircle,      active: "text-rose-500",    badge: "bg-rose-50 text-rose-700"     },
};

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onStatusChange, onDelete, onUpdate, defaultShowComments }) {
  const userId = getStoredUser()?.id;
  // creator or assignee may edit from lists; the server has the final say
  // the task page sends the server's verdict; lists fall back to "mine or assigned to me"
  const isMine = task.permissions
    ? task.permissions.canEdit
    : !task.user_id || task.user_id === userId || task.assignee_id === userId;
  const [showComments, setShowComments] = useState(!!defaultShowComments);
  const [editing, setEditing] = useState(false);
  const [liked, setLiked] = useState(() => !!task.reactions?.some((r) => r.user_id === userId));
  const [likeCount, setLikeCount] = useState(task.reactions?.length ?? 0);

  const handleReact = async () => {
    const res = await apiRequest(`/tasks/${task.id}/react`, "POST", {}).catch(() => null);
    if (!res) return;
    setLiked(res.liked);
    setLikeCount((c) => (res.liked ? c + 1 : c - 1));
  };

  const cfg = STATUS[task.status] || STATUS.Doing;

  return (
    <li className="px-4 py-3 group hover:bg-gray-50 transition-colors">
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Status toggles */}
        <div className="flex items-center gap-1 shrink-0">
          {Object.entries(STATUS).map(([s, { icon: Icon, active }]) => (
            <button
              key={s}
              disabled={!isMine || !onStatusChange}
              onClick={() => onStatusChange?.(task.id, s)}
              title={s}
              className={`p-0.5 rounded transition-colors ${
                task.status === s ? active : "text-gray-200 hover:text-gray-400"
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-gray-900 truncate ${task.status === "Done" ? "line-through text-gray-400" : ""}`}>
            {task.title}
          </p>
          {/* Tags */}
          {task.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {task.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          <TaskMeta task={task} />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline ${cfg.badge}`}>
            {task.status}
          </span>

          {/* Like */}
          <button
            onClick={handleReact}
            className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors ${
              liked ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <ThumbsUp size={13} className={liked ? "fill-gray-900" : ""} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>

          {/* Comment toggle */}
          <button
            onClick={() => setShowComments((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <MessageCircle size={13} />
            <ChevronDown size={11} className={`transition-transform ${showComments ? "rotate-180" : ""}`} />
          </button>

          {isMine && onUpdate && (
            <button
              onClick={() => setEditing(true)}
              title="Edit"
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-gray-600 transition-all"
            >
              <Pencil size={13} />
            </button>
          )}

          {/* Delete */}
          {isMine && onDelete && (
            <button
              onClick={() => onDelete(task.id)}
              title="Delete"
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-rose-400 transition-all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Comment panel */}
      {showComments && <CommentPanel taskId={task.id} />}
      {editing && (
        <TaskEditModal task={task} onClose={() => setEditing(false)} onSaved={onUpdate} />
      )}
    </li>
  );
}

// ── TaskList ──────────────────────────────────────────────────────────────────
export default function TaskList({ tasks, onStatusChange, onDelete, onUpdate, showComments = false, emptyText = "No tasks yet for this day." }) {
  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState icon={CheckSquareOffset} title={emptyText} text="Things you finish or are working on show up here." />
    );
  }

  return (
    <ul className="divide-y divide-gray-50">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onUpdate={onUpdate}
          defaultShowComments={showComments}
        />
      ))}
    </ul>
  );
}
