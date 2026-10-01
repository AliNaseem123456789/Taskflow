import { useEffect, useState } from "react";
import { Pencil, Trash2, Target } from "lucide-react";
import GoalBar from "../components/GoalBar";
import GoalForm from "../components/GoalForm";
import { apiRequest } from "../utils/api";
import AreaTile from "../components/AreaTile";

export default function GoalsPage() {
  const [goals, setGoals] = useState(null);
  const [tags, setTags] = useState([]);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    apiRequest("/goals").then(setGoals).catch(() => setGoals([]));
    apiRequest("/tags").then(setTags).catch(() => {});
  }, []);

  const create = async (fields) => {
    const goal = await apiRequest("/goals", "POST", fields);
    setGoals((g) => [...g, goal]);
  };

  const update = async (id, fields) => {
    const goal = await apiRequest(`/goals/${id}`, "PUT", fields);
    setGoals((g) => g.map((x) => (x.id === id ? goal : x)));
    setEditingId(null);
  };

  const remove = async (id) => {
    await apiRequest(`/goals/${id}`, "DELETE").catch(() => {});
    setGoals((g) => g.filter((x) => x.id !== id));
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title"><AreaTile />Goals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set a number of Done tasks to reach each week or month. Progress resets at the start of each period.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-display text-[17px] font-bold text-gray-900 mb-3">New goal</h2>
        <GoalForm tags={tags} onSubmit={create} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        {goals === null && <p className="text-sm text-gray-400">Loading…</p>}
        {goals?.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Target size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No goals yet</p>
          </div>
        )}
        {goals?.map((goal) =>
          editingId === goal.id ? (
            <GoalForm key={goal.id} initial={goal} tags={tags} submitLabel="Save"
              onSubmit={(f) => update(goal.id, f)} onCancel={() => setEditingId(null)} />
          ) : (
            <GoalBar
              key={goal.id}
              goal={goal}
              actions={
                <>
                  <button onClick={() => setEditingId(goal.id)} className="p-1 text-gray-300 hover:text-gray-600" title="Edit">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => remove(goal.id)} className="p-1 text-gray-300 hover:text-rose-500" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </>
              }
            />
          )
        )}
      </div>
    </div>
  );
}
