import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Building2, Users } from "lucide-react";
import { apiRequest } from "../utils/api";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";

// Departments and where each team sits. Admins edit; everyone else reads.
export default function CompanyStructure({ company }) {
  const [org, setOrg] = useState(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState("");
  const canEdit = ["owner", "admin"].includes(company.my_role);

  const load = useCallback(
    () => apiRequest(`/companies/${company.id}/org`).then(setOrg).catch((err) => setError(err.message)),
    [company.id]
  );
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !org) return <p className="text-sm text-gray-500">{error}</p>;
  if (!org) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;

  const { departments, teams, people } = org;
  const heads = people.filter((p) => ["owner", "admin", "manager"].includes(p.role));
  const personName = (id) => { const p = people.find((x) => x.id === id); return p ? p.name || p.email : null; };

  const addDept = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(async () => {
      await apiRequest(`/companies/${company.id}/departments`, "POST", { name, parent_id: parent || null });
      setName("");
      setParent("");
    });
  };
  const updateDept = (d, body) => run(() => apiRequest(`/companies/${company.id}/departments/${d.id}`, "PUT", body));
  const deleteDept = (d) =>
    window.confirm(`Delete ${d.name}? Its teams and people move up a level.`) &&
    run(() => apiRequest(`/companies/${company.id}/departments/${d.id}`, "DELETE"));
  const placeTeam = (t, body) => run(() => apiRequest(`/companies/${company.id}/teams/${t.id}/placement`, "PUT", body));

  // departments in tree order with depth, so sub-departments sit under their parent
  const ordered = [];
  const walk = (parentId, depth) =>
    departments.filter((d) => (d.parent_id || null) === parentId).forEach((d) => {
      ordered.push({ ...d, depth });
      walk(d.id, depth + 1);
    });
  walk(null, 0);

  const teamRow = (t) => (
    <div key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
      <Users size={13} className="text-gray-400" />
      <span className="text-sm text-gray-800 flex-1 min-w-[120px]">
        {t.name} <span className="text-xs text-gray-400">· {t.members.length} {t.members.length === 1 ? "person" : "people"}</span>
      </span>
      {canEdit ? (
        <>
          <select className={`${inputCls} text-xs py-1`} value={t.department_id || ""} title="Department"
            onChange={(e) => placeTeam(t, { department_id: e.target.value || null })}>
            <option value="">No department</option>
            {ordered.map((d) => <option key={d.id} value={d.id}>{"— ".repeat(d.depth)}{d.name}</option>)}
          </select>
          <select className={`${inputCls} text-xs py-1`} value={t.parent_team_id || ""} title="Part of team"
            onChange={(e) => placeTeam(t, { parent_team_id: e.target.value || null })}>
            <option value="">Top-level team</option>
            {teams.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>inside {x.name}</option>)}
          </select>
        </>
      ) : (
        t.parent_team_id && <span className="text-xs text-gray-400">inside {teams.find((x) => x.id === t.parent_team_id)?.name}</span>
      )}
    </div>
  );

  const unplaced = teams.filter((t) => !t.department_id);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {canEdit && (
        <form onSubmit={addDept} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-2 items-center">
          <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="New department, e.g. Engineering" value={name}
            onChange={(e) => setName(e.target.value)} />
          <select className={inputCls} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Top level</option>
            {ordered.map((d) => <option key={d.id} value={d.id}>inside {d.name}</option>)}
          </select>
          <button className="flex items-center gap-1 px-3 py-2 btn-accent text-sm rounded-md">
            <Plus size={14} /> Add department
          </button>
        </form>
      )}

      {ordered.length === 0 && (
        <p className="text-sm text-gray-500">
          No departments yet.{canEdit ? " Group your teams into departments like Engineering or Sales; a department's manager sees all of its teams' work." : ""}
        </p>
      )}

      {ordered.map((d) => {
        const dTeams = teams.filter((t) => t.department_id === d.id);
        return (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4" style={{ marginLeft: d.depth * 24 }}>
            <div className="flex flex-wrap items-center gap-2">
              <Building2 size={15} className="text-gray-500" />
              {canEdit ? (
                <input className="text-sm font-semibold text-gray-900 bg-transparent outline-none border-b border-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 flex-1 min-w-[120px]"
                  defaultValue={d.name} onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && updateDept(d, { name: e.target.value })} />
              ) : (
                <span className="text-sm font-semibold text-gray-900 flex-1">{d.name}</span>
              )}
              {canEdit ? (
                <select className={`${inputCls} text-xs py-1`} value={d.head_user_id || ""} title="Head of department"
                  onChange={(e) => updateDept(d, { head_user_id: e.target.value || null })}>
                  <option value="">No head</option>
                  {heads.map((p) => <option key={p.id} value={p.id}>Head: {p.name || p.email}</option>)}
                </select>
              ) : (
                d.head_user_id && <span className="text-xs text-gray-500">Head: {personName(d.head_user_id)}</span>
              )}
              <span className="text-xs text-gray-400">{people.filter((p) => p.department_id === d.id).length} people</span>
              {canEdit && (
                <button onClick={() => deleteDept(d)} className="p-1 text-gray-300 hover:text-rose-500" title="Delete department">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="mt-2 pl-5 divide-y divide-gray-50">
              {dTeams.length === 0 ? <p className="text-xs text-gray-400 py-1">No teams here yet.</p> : dTeams.map(teamRow)}
            </div>
          </div>
        );
      })}

      {unplaced.length > 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Teams not in a department</p>
          <div className="divide-y divide-gray-100">{unplaced.map(teamRow)}</div>
        </div>
      )}
      {canEdit && heads.length === 0 && (
        <p className="text-xs text-gray-400">Tip: only Managers, Admins and the Owner can head a department. Change roles in People.</p>
      )}
    </div>
  );
}
