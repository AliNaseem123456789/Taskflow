import { Link } from "react-router-dom";
import { Square } from "lucide-react";
import { fmtClock, useTimer } from "../utils/timer";

// A small bar in the sidebar while a timer runs, wherever you are in the app.
export default function RunningTimer({ onNavigate }) {
  const { running, now, stop } = useTimer();
  if (!running) return null;
  const label = running.task?.title || running.note || "No task";
  return (
    <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50">
      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
      <Link to={running.task_id ? `/tasks/${running.task_id}` : "/timesheet"} onClick={onNavigate} className="min-w-0 flex-1">
        <p className="text-xs text-gray-900 truncate" title={label}>{label}</p>
        <p className="text-[11px] text-rose-700 tabular-nums">{fmtClock(running.started_at, now)}</p>
      </Link>
      <button onClick={() => stop().catch(() => {})} aria-label="Stop timer" className="p-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700">
        <Square size={10} className="fill-current" />
      </button>
    </div>
  );
}
