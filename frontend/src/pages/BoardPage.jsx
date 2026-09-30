import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import TaskMeta from "../components/TaskMeta";
import TaskEditModal from "../components/TaskEditModal";
import { apiRequest } from "../utils/api";
import { STATUSES, STATUS_BADGE } from "../utils/taskMeta";
import { localDate, shiftDate } from "../utils/date";

const DONE_DAYS = 7; // Done column shows the last week

// Sort by board position, then oldest first
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id;

const groupTasks = (tasks) =>
  Object.fromEntries(STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).sort(byPosition)]));

// ── Card ─────────────────────────────────────────────────────────────────────
function Card({ task, onOpen, overlay = false }) {
  return (
    <div
      onClick={() => onOpen?.(task)}
      className={`bg-white border border-gray-200 rounded-md p-3 cursor-grab active:cursor-grabbing select-none ${
        overlay ? "shadow-xl rotate-1" : "hover:border-gray-300"
      }`}
    >
      <p className={`text-sm text-gray-900 ${task.status === "Done" ? "line-through text-gray-400" : ""}`}>
        {task.title}
      </p>
      {task.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {task.tags.map((tag) => (
            <span key={tag.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: tag.color }}>
              {tag.name}
            </span>
          ))}
        </div>
      )}
      <TaskMeta task={task} />
      <p className="text-[10px] text-gray-400 mt-1.5">{task.date_logged}</p>
    </div>
  );
}

function SortableCard({ task, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
    >
      <Card task={task} onOpen={onOpen} />
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────
function Column({ status, tasks, onOpen, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });
  return (
    <div className="flex flex-col min-w-[260px] flex-1">
      <div className="flex items-center justify-between mb-2 px-1 h-7">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
          <span className="text-xs text-gray-400">{tasks.length}</span>
        </div>
        {status !== "Done" && (
          <button onClick={() => onAdd(status)} className="p-1 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100" title="Add task">
            <Plus size={14} />
          </button>
        )}
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 space-y-2 rounded-lg p-2 min-h-[200px] transition-colors ${
            isOver ? "bg-gray-100" : "bg-gray-50 border border-dashed border-gray-200"
          }`}
        >
          {tasks.map((t) => <SortableCard key={t.id} task={t} onOpen={onOpen} />)}
          {tasks.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Drop tasks here</p>}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BoardPage() {
  const [columns, setColumns] = useState(null); // { Doing: [...], Delayed: [...], Done: [...] }
  const [activeTask, setActiveTask] = useState(null);
  const [editing, setEditing] = useState(null);
  const [newTitle, setNewTitle] = useState({ status: null, title: "" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a click still opens the card
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }), // long-press on phones
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async () => {
    const today = localDate();
    const [open, recentDone] = await Promise.all([
      apiRequest("/tasks?open=1"),
      apiRequest(`/tasks?start=${shiftDate(today, -(DONE_DAYS - 1))}&end=${today}`),
    ]);
    const all = [...open, ...recentDone.filter((t) => t.status === "Done")];
    setColumns(groupTasks(all));
  };

  useEffect(() => {
    load().catch(() => setColumns(groupTasks([])));
  }, []);

  const findColumn = (id) =>
    STATUSES.includes(id) ? id : STATUSES.find((s) => columns[s].some((t) => t.id === id));

  const save = (status, list) =>
    apiRequest("/tasks/reorder", "PUT", { status, ids: list.map((t) => t.id) }).catch(() => load());

  // Moving between columns while dragging, so the card shows where it'll land
  const onDragOver = ({ active, over }) => {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const moving = cols[from].find((t) => t.id === active.id);
      const overIndex = cols[to].findIndex((t) => t.id === over.id);
      const index = overIndex >= 0 ? overIndex : cols[to].length;
      const target = [...cols[to]];
      target.splice(index, 0, { ...moving, status: to });
      return { ...cols, [from]: cols[from].filter((t) => t.id !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }) => {
    const startColumn = activeTask?.status;
    setActiveTask(null);
    if (!over) return;
    const column = findColumn(active.id);
    const list = columns[column];
    const oldIndex = list.findIndex((t) => t.id === active.id);
    const newIndex = STATUSES.includes(over.id) ? list.length - 1 : list.findIndex((t) => t.id === over.id);
    const reordered = newIndex >= 0 && newIndex !== oldIndex ? arrayMove(list, oldIndex, newIndex) : list;

    setColumns((cols) => ({ ...cols, [column]: reordered }));
    save(column, reordered);
    if (startColumn && startColumn !== column) save(startColumn, columns[startColumn]);
  };

  const addTask = async (e) => {
    e.preventDefault();
    const { status, title } = newTitle;
    if (!title.trim()) return;
    const task = await apiRequest("/tasks", "POST", { title, status }).catch(() => null);
    if (task) setColumns((cols) => ({ ...cols, [status]: [task, ...cols[status]] }));
    setNewTitle({ status: null, title: "" });
  };

  const onSaved = (updated) =>
    setColumns((cols) => {
      const rest = Object.fromEntries(STATUSES.map((s) => [s, cols[s].filter((t) => t.id !== updated.id)]));
      rest[updated.status] = [...rest[updated.status], updated].sort(byPosition);
      return rest;
    });

  if (!columns) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Board</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drag tasks between columns to change their status. Done shows the last {DONE_DAYS} days.
        </p>
      </div>

      {newTitle.status && (
        <form onSubmit={addTask} className="mb-4 flex gap-2 max-w-md">
          <input
            autoFocus
            value={newTitle.title}
            onChange={(e) => setNewTitle((n) => ({ ...n, title: e.target.value }))}
            placeholder={`New "${newTitle.status}" task`}
            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white"
          />
          <button className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md">Add</button>
          <button type="button" onClick={() => setNewTitle({ status: null, title: "" })} className="px-2 text-sm text-gray-500">
            Cancel
          </button>
        </form>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }) =>
          setActiveTask(STATUSES.flatMap((s) => columns[s]).find((t) => t.id === active.id))
        }
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => { setActiveTask(null); load(); }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUSES.map((s) => (
            <Column
              key={s}
              status={s}
              tasks={columns[s]}
              onOpen={setEditing}
              onAdd={(status) => setNewTitle({ status, title: "" })}
            />
          ))}
        </div>
        <DragOverlay>{activeTask ? <Card task={activeTask} overlay /> : null}</DragOverlay>
      </DndContext>

      {editing && <TaskEditModal task={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}
