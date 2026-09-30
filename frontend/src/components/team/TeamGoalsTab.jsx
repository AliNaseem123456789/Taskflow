import { useCallback, useEffect, useState } from "react";
import { Target, Trash2 } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { useLiveEvent } from "../../utils/live";
import GoalBar from "../GoalBar";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";

// Team goals count Done tasks from every member (optionally one project)
export default function TeamGoalsTab({ team }) {
  const isAdmin = team.role === "admin";
  const [goals, setGoals] = useState(null);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ title: "", target: 20, period: "week", project_id: "" });
  const [error, setError] = useState("");

  const load = useCallback(
    () => apiRequest(`/teams/${team.id}/goals`).then(setGoals).catch(() => setGoals([])),
    [team.id]
  );
  useEffect(() => {
    load();
    apiRequest(`/teams/${team.id}/projects`).then((p) => setProjects(p.filter((x) => !x.archived))).catch(() => {});
  }, [load, team.id]);
  useLiveEvent(["goal", "task"], load);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await apiRequest(`/teams/${team.id}/goals`, "POST", { ...form, target: Number(form.target), project_id: form.project_id || null });
      setForm({ ...form, title: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (goalId) => {
    await apiRequest(`/teams/${team.id}/goals/${goalId}`, "DELETE").catch(() => {});
    load();
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <form onSubmit={create} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} flex-1 min-w-[180px]`} required placeholder="e.g. Close 30 billing tasks"
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input type="number" min="1" className={`${inputCls} w-20`} value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })} />
            <select className={inputCls} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              <option value="week">per week</option>
              <option value="month">per month</option>
            </select>
            <select className={inputCls} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Any project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md">Add team goal</button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        {goals === null && <p className="text-sm text-gray-400">Loading…</p>}
        {goals?.length === 0 && (
          <div className="text-center py-6 text-gray-400">
            <Target size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No team goals yet{isAdmin ? "" : " — an admin can add one"}.</p>
          </div>
        )}
        {goals?.map((g) => (
          <div key={g.id}>
            <GoalBar
              goal={{ ...g, tags: g.projects ? { name: g.projects.name, color: g.projects.color } : null }}
              actions={
                isAdmin && (
                  <button onClick={() => remove(g.id)} className="p-1 text-gray-300 hover:text-rose-500" title="Delete">
                    <Trash2 size={12} />
                  </button>
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
