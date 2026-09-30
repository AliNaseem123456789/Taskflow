import { useState } from "react";
import { CheckCircle, Clock, XCircle, Trash2, ThumbsUp, MessageCircle, ChevronDown } from "lucide-react";
import { apiRequest } from "../utils/api";

const STATUS = {
  Done:    { icon: CheckCircle, active: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" },
  Doing:   { icon: Clock,        active: "text-amber-500",   badge: "bg-amber-50 text-amber-700"   },
  Delayed: { icon: XCircle,      active: "text-rose-500",    badge: "bg-rose-50 text-rose-700"     },
};

// ── Inline comment panel ──────────────────────────────────────────────────────
function CommentPanel({ taskId }) {
  const [comments, setComments]   = useState(null);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const token = localStorage.getItem("token");
  const userId = (() => { try { return JSON.parse(localStorage.getItem("user"))?.id; } catch { return null; } })();

  const load = async () => {
    if (comments !== null) return;
    const data = await apiRequest(`/tasks/${taskId}/comments`, "GET", null, token).catch(() => []);
    setComments(data);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    const c = await apiRequest(`/tasks/${taskId}/comments`, "POST", { content: input }, token).catch(() => null);
    if (c) setComments((prev) => [...(prev || []), c]);
    setInput("");
    setLoading(false);
  };

  const remove = async (cId) => {
    await apiRequest(`/tasks/comments/${cId}`, "DELETE", null, token).catch(() => {});
    setComments((prev) => prev.filter((c) => c.id !== cId));
  };

  return (
    <div className="mt-2 border-t border-gray-100 pt-2" onClick={load}>
      {/* Comment list */}
      {comments?.map((c) => (
        <div key={c.id} className="flex items-start gap-2 py-1.5 group">
          <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[9px] font-semibold text-gray-500 shrink-0 mt-0.5">
            {(c.user?.name || c.user?.email || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-gray-700">
              {c.user?.name || c.user?.email}
            </span>
            <p className="text-xs text-gray-600 mt-0.5">{c.content}</p>
          </div>
          {c.user_id === userId && (
            <button
              onClick={() => remove(c.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-rose-400 transition-all"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}

      {/* Input */}
      <form onSubmit={submit} className="flex items-center gap-2 mt-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="text-xs bg-gray-900 text-white px-2.5 py-1.5 rounded-md disabled:opacity-40 hover:bg-gray-800 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onStatusChange, onDelete }) {
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(task.reactions?.length ?? 0);
  const token = localStorage.getItem("token");
  const userId = (() => { try { return JSON.parse(localStorage.getItem("user"))?.id; } catch { return null; } })();

  // Initialise liked state from reactions
  useState(() => {
    if (userId && task.reactions?.some((r) => r.user_id === userId)) setLiked(true);
  });

  const handleReact = async () => {
    const res = await apiRequest(`/tasks/${task.id}/react`, "POST", {}, token).catch(() => null);
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
              onClick={() => onStatusChange(task.id, s)}
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

          {/* Delete */}
          <button
            onClick={() => onDelete(task.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-rose-400 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Comment panel */}
      {showComments && <CommentPanel taskId={task.id} />}
    </li>
  );
}

// ── TaskList ──────────────────────────────────────────────────────────────────
export default function TaskList({ tasks, onStatusChange, onDelete }) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm text-gray-400">No tasks yet for this day.</p>
      </div>
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
        />
      ))}
    </ul>
  );
}