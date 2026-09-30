import { CalendarClock, Repeat, AlertOctagon } from "lucide-react";
import { priorityInfo, recurrenceLabel } from "../utils/taskMeta";
import { localDate } from "../utils/date";

// Small chips under a task title: priority, due date, repeat, blocker.
export default function TaskMeta({ task, showBlocker = true }) {
  const priority = priorityInfo(task.priority);
  const overdue = task.due_date && task.status !== "Done" && task.due_date < localDate();
  const isRecurring = task.recurrence || task.recurrence_parent_id;

  const chips = [];
  if (task.priority && task.priority !== "medium")
    chips.push(
      <span key="p" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${priority.badge}`}>
        {priority.label}
      </span>
    );
  if (task.due_date)
    chips.push(
      <span
        key="d"
        className={`flex items-center gap-1 text-[10px] ${overdue ? "text-rose-600 font-semibold" : "text-gray-500"}`}
        title={overdue ? "Overdue" : "Due date"}
      >
        <CalendarClock size={11} />
        {overdue ? "Overdue · " : "Due "}
        {task.due_date}
      </span>
    );
  if (isRecurring)
    chips.push(
      <span key="r" className="flex items-center gap-1 text-[10px] text-gray-500" title="Repeating task">
        <Repeat size={11} />
        {task.recurrence ? recurrenceLabel(task.recurrence) : "Repeats"}
      </span>
    );

  if (!chips.length && !(showBlocker && task.blocker)) return null;

  return (
    <div className="mt-1 space-y-1">
      {chips.length > 0 && <div className="flex flex-wrap items-center gap-2">{chips}</div>}
      {showBlocker && task.blocker && (
        <p className="flex items-start gap-1 text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 w-fit">
          <AlertOctagon size={11} className="mt-0.5 shrink-0" />
          <span>Blocked: {task.blocker}</span>
        </p>
      )}
    </div>
  );
}
