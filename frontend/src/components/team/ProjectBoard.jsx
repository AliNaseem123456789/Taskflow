import { useCallback, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, closestCorners, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ListChecks, Lock, Plus, Settings2, X } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { useLiveEvent } from "../../utils/live";
import { priorityInfo } from "../../utils/taskMeta";
import { FieldsContext, fieldText, useMembersOf } from "../../utils/fields";

const KINDS = [["todo", "Not started"], ["in_progress", "In progress"], ["done", "Done"]];
const inputCls = "text-sm px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";

function Card({ task, overlay = false }) {
  const p = priorityInfo(task.priority);
  const { fields, people } = useContext(FieldsContext);
  const chips = fields.map((f) => [f, fieldText(f, task.fields?.[f.id], people)]).filter(([, t]) => t).slice(0, 3);
  return (
    <div className={`bg-white border border-gray-200 rounded-md p-3 select-none ${overlay ? "shadow-xl rotate-1" : "hover:border-gray-300"}`}>
      <Link to={`/tasks/${task.id}`} onClick={(e) => overlay && e.preventDefault()} className="text-sm text-gray-900 hover:underline block">
        {task.title}
      </Link>
      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-gray-500">
        {task.blocked && <span className="flex items-center gap-0.5 text-amber-700" title="Waiting on another task"><Lock size={10} /> waiting</span>}
        {task.priority && task.priority !== "medium" && <span className={`font-semibold px-1.5 py-0.5 rounded ${p.badge}`}>{p.label}</span>}
        {task.due_date && <span>Due {task.due_date}</span>}
        {task.subtasks.total > 0 && <span title="Subtasks done">{task.subtasks.done}/{task.subtasks.total} subtasks</span>}
        {task.checklist.total > 0 && (
          <span className="flex items-center gap-0.5" title="Checklist"><ListChecks size={10} /> {task.checklist.done}/{task.checklist.total}</span>
        )}
        {chips.map(([f, t]) => (
          <span key={f.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 max-w-28 truncate" title={`${f.name}: ${t}`}>{t}</span>
        ))}
        {task.assignee && (
          <span className="ml-auto w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-semibold" title={task.assignee.name || task.assignee.email}>
            {(task.assignee.name || task.assignee.email)[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function SortableCard({ task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <Card task={task} />
    </div>
  );
}

function Column({ status, tasks, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const [title, setTitle] = useState(null);
  return (
    <div className="flex flex-col min-w-[240px] w-[260px] shrink-0">
      <div className="flex items-center gap-2 mb-2 px-1 h-7">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-xs font-semibold text-gray-700">{status.name}</span>
        <span className="text-xs text-gray-400">{tasks.length}</span>
        {status.category !== "done" && (
          <button onClick={() => setTitle("")} className="ml-auto p-1 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100" aria-label={`Add task to ${status.name}`}>
            <Plus size={14} />
          </button>
        )}
      </div>
      {title !== null && (
        <form className="mb-2" onSubmit={async (e) => {
          e.preventDefault();
          if (title.trim()) await onAdd(status, title.trim());
          setTitle(null);
        }}>
          <input autoFocus className={`${inputCls} w-full`} placeholder="Task title, then Enter" value={title}
            onChange={(e) => setTitle(e.target.value)} onBlur={() => !title && setTitle(null)} />
        </form>
      )}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex-1 space-y-2 rounded-lg p-2 min-h-[160px] ${isOver ? "bg-gray-100" : "bg-gray-50 border border-dashed border-gray-200"}`}>
          {tasks.map((t) => <SortableCard key={t.id} task={t} />)}
        </div>
      </SortableContext>
    </div>
  );
}

// Lead/admin: rename, reorder, add, remove columns and set what each counts as
function ColumnEditor({ team, project, statuses, onClose, onSaved }) {
  const [list, setList] = useState(statuses.map(({ id, name, category, color }) => ({ id, name, category, color })));
  const [error, setError] = useState("");
  const set = (i, patch) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => { const j = i + d; if (j >= 0 && j < list.length) setList(arrayMove(list, i, j)); };
  const save = async () => {
    setError("");
    try {
      await apiRequest(`/teams/${team.id}/projects/${project.id}/statuses`, "PUT", { statuses: list });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-2 max-w-2xl">
      <p className="text-sm font-semibold text-gray-900">Columns</p>
      {list.map((s, i) => (
        <div key={s.id || `new${i}`} className="flex flex-wrap items-center gap-2">
          <input type="color" value={s.color} onChange={(e) => set(i, { color: e.target.value })} className="w-7 h-7 rounded border border-gray-200" aria-label="Colour" />
          <input className={`${inputCls} flex-1 min-w-[120px]`} value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
          <select className={inputCls} value={s.category} onChange={(e) => set(i, { category: e.target.value })} title="Counts as">
            {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={() => move(i, -1)} className="p-1 text-gray-400 hover:text-gray-900" aria-label="Move up"><ArrowUp size={13} /></button>
          <button onClick={() => move(i, 1)} className="p-1 text-gray-400 hover:text-gray-900" aria-label="Move down"><ArrowDown size={13} /></button>
          <button onClick={() => setList(list.filter((_, j) => j !== i))} className="p-1 text-gray-300 hover:text-rose-500" aria-label="Remove column"><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setList([...list, { name: "New column", category: "in_progress", color: "#3b82f6" }])}
        className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"><Plus size={12} /> Add column</button>
      <p className="text-xs text-gray-400">Cards in a removed column move to the first column of the same kind.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md">Save columns</button>
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
      </div>
    </div>
  );
}

// A project's own board: its columns, cards dragged between them
export default function ProjectBoard({ team, project }) {
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState({}); // columnId -> tasks
  const [active, setActive] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const base = `/teams/${team.id}/projects/${project.id}`;
  const people = useMembersOf(board?.project?.company_id);

  const load = useCallback(async () => {
    try {
      const b = await apiRequest(`${base}/board`);
      setBoard(b);
      setColumns(Object.fromEntries(b.statuses.map((s) => [s.id, b.tasks.filter((t) => t.column_id === s.id)])));
    } catch (err) {
      setError(err.message);
    }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  useLiveEvent(["task", "project"], load);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (error) return <p className="text-sm text-gray-500">{error}</p>;
  if (!board) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;

  const findColumn = (id) => (columns[id] ? id : Object.keys(columns).find((c) => columns[c].some((t) => t.id === id)));
  const save = (columnId, list) =>
    apiRequest(`${base}/board/move`, "PUT", { status_id: columnId, ids: list.map((t) => t.id) }).catch(() => load());

  const onDragOver = ({ active: a, over }) => {
    if (!over) return;
    const from = findColumn(a.id), to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const moving = cols[from].find((t) => t.id === a.id);
      const idx = cols[to].findIndex((t) => t.id === over.id);
      const target = [...cols[to]];
      target.splice(idx >= 0 ? idx : target.length, 0, moving);
      return { ...cols, [from]: cols[from].filter((t) => t.id !== a.id), [to]: target };
    });
  };
  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const column = findColumn(a.id);
    const list = columns[column];
    const oldIndex = list.findIndex((t) => t.id === a.id);
    const newIndex = columns[over.id] ? list.length - 1 : list.findIndex((t) => t.id === over.id);
    const reordered = newIndex >= 0 && newIndex !== oldIndex ? arrayMove(list, oldIndex, newIndex) : list;
    setColumns((cols) => ({ ...cols, [column]: reordered }));
    save(column, reordered);
  };

  const addTask = async (status, title) => {
    await apiRequest("/tasks", "POST", { title, project_id: project.id, status_id: status.id }).catch((err) => setError(err.message));
    load();
  };

  return (
    <div>
      {board.can_edit_columns && !editing && (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 mb-3">
          <Settings2 size={13} /> Edit columns
        </button>
      )}
      {editing && (
        <ColumnEditor team={team} project={project} statuses={board.statuses} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }} />
      )}
      <FieldsContext.Provider value={{ fields: board.fields || [], people: people.byId }}>
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={({ active: a }) => setActive(board.tasks.find((t) => t.id === a.id))}
        onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); load(); }}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {board.statuses.map((s) => <Column key={s.id} status={s} tasks={columns[s.id] || []} onAdd={addTask} />)}
        </div>
        <DragOverlay>{active ? <Card task={active} overlay /> : null}</DragOverlay>
      </DndContext>
      </FieldsContext.Provider>
      <p className="text-xs text-gray-400">Finished cards stay for two weeks. Subtasks live inside their card.</p>
    </div>
  );
}
