import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { apiRequest } from "../utils/api";
import { ROLE_LABELS } from "../utils/workspace";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const initial = (p) => (p.name || p.email || "?")[0].toUpperCase();

// One person and everyone who reports to them (collapsible)
function Node({ person, reportsOf, deptName, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const reports = reportsOf(person.id);
  return (
    <li>
      <div className="flex items-center gap-2 py-1.5">
        {reports.length ? (
          <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-gray-700" aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px]" />
        )}
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-600 shrink-0">
          {initial(person)}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-900 truncate">
            {person.name || person.email}
            {reports.length > 0 && <span className="text-xs text-gray-400"> · {reports.length} direct</span>}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {[person.job_title, person.level, deptName(person.department_id), ROLE_LABELS[person.role]].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {open && reports.length > 0 && (
        <ul className="ml-[7px] pl-5 border-l border-gray-200">
          {reports.map((r) => <Node key={r.id} person={r} reportsOf={reportsOf} deptName={deptName} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

// Reporting lines (who reports to whom) plus a searchable directory
export default function OrgChart({ company }) {
  const [org, setOrg] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("chart");
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("");
  const [dept, setDept] = useState("");

  useEffect(() => {
    apiRequest(`/companies/${company.id}/org`).then(setOrg).catch((err) => setError(err.message));
  }, [company.id]);

  const helpers = useMemo(() => {
    if (!org) return null;
    const ids = new Set(org.people.map((p) => p.id));
    const byName = (a, b) => (a.name || a.email).localeCompare(b.name || b.email);
    return {
      // top of the chart: nobody (still in the company) above them
      roots: org.people.filter((p) => !p.manager_id || !ids.has(p.manager_id)).sort(byName),
      reportsOf: (id) => org.people.filter((p) => p.manager_id === id).sort(byName),
      deptName: (id) => org.departments.find((d) => d.id === id)?.name,
      teamName: (id) => org.teams.find((t) => t.id === id)?.name,
      skills: [...new Set(org.people.flatMap((p) => p.skills || []))].sort(),
    };
  }, [org]);

  if (error) return <p className="text-sm text-gray-500">{error}</p>;
  if (!org) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;
  const { roots, reportsOf, deptName, teamName, skills } = helpers;

  const q = query.toLowerCase();
  const found = org.people.filter((p) =>
    (!skill || (p.skills || []).includes(skill)) &&
    (!dept || p.department_id === dept) &&
    `${p.name || ""} ${p.email} ${p.job_title || ""} ${(p.skills || []).join(" ")}`.toLowerCase().includes(q)
  );
  const nameOf = (id) => { const p = org.people.find((x) => x.id === id); return p ? p.name || p.email : null; };

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {[["chart", "Reporting lines"], ["directory", "Directory"]].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-3 py-1.5 text-xs rounded-md ${view === k ? "btn-accent " : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "chart" && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          {org.people.every((p) => !p.manager_id) && (
            <p className="text-xs text-gray-400 mb-2">Nobody has a manager set yet. Set "Reports to" in People to build the chart.</p>
          )}
          <ul>{roots.map((p) => <Node key={p.id} person={p} reportsOf={reportsOf} deptName={deptName} depth={0} />)}</ul>
        </div>
      )}

      {view === "directory" && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={`${inputCls} w-full pl-8`} placeholder="Name, title or skill" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">All departments</option>
              {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <span className="text-xs text-gray-400 self-center">{found.length} people</span>
          </div>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {skills.map((s) => (
                <button key={s} onClick={() => setSkill(skill === s ? "" : s)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${skill === s ? "btn-accent border-indigo-600" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {found.map((p) => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">{initial(p)}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name || p.email}</p>
                    <p className="text-xs text-gray-500 truncate">{[p.job_title, p.level].filter(Boolean).join(" · ") || ROLE_LABELS[p.role]}</p>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                  {p.department_id && <p>Department: {deptName(p.department_id)}</p>}
                  {p.manager_id && nameOf(p.manager_id) && <p>Reports to {nameOf(p.manager_id)}</p>}
                  {p.team_ids.length > 0 && <p>Teams: {p.team_ids.map(teamName).filter(Boolean).join(", ")}</p>}
                  <p className="truncate">{p.email}</p>
                </div>
                {p.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.skills.map((s) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{s}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
