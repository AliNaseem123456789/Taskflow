import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Plane } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import AreaTile from "../components/AreaTile";

const LOAD = {
  light: { label: "Room for more", chip: "bg-blue-50 text-blue-700", bar: "bg-blue-400" },
  normal: { label: "Steady", chip: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  heavy: { label: "Stretched", chip: "bg-rose-50 text-rose-700", bar: "bg-rose-500" },
};

// Who has how much open work right now, and who's away — before you assign more
export default function Workload() {
  const companyId = getWorkspace();
  const { teams } = useCompanyPeople();
  const [team, setTeam] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    setError("");
    apiRequest(`/companies/${companyId}/workload${team ? `?team_id=${team}` : ""}`)
      .then(setData).catch((err) => { setError(err.message); setData({ people: [] }); });
  }, [companyId, team]);

  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (!data) return <div className="p-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>;
  const max = Math.max(1, ...data.people.map((p) => p.open));

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title"><AreaTile />Workload</h1>
          <p className="text-sm text-gray-500 mt-1">Open company work per person, with time off. Personal dones are never included.</p>
        </div>
        <select className="text-sm px-3 py-2 border border-gray-200 rounded-md bg-white" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Everyone I can see</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Person</th>
              <th className="px-2 py-2 font-medium w-[30%]">Open tasks</th>
              <th className="px-2 py-2 font-medium text-center">Due this week</th>
              <th className="px-2 py-2 font-medium text-center">Overdue</th>
              <th className="px-2 py-2 font-medium text-center">To review</th>
              <th className="px-2 py-2 font-medium text-center">Done (7d)</th>
              <th className="px-2 py-2 font-medium">Away</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.people.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nobody to show.</td></tr>}
            {data.people.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">
                  <p className="text-gray-900">{p.name || p.email}</p>
                  {p.job_title && <p className="text-xs text-gray-400">{p.job_title}</p>}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${LOAD[p.load].bar}`} style={{ width: `${(p.open / max) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-700 w-6 text-right">{p.open}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center text-gray-700">{p.due_this_week || "–"}</td>
                <td className={`px-2 py-2.5 text-center ${p.overdue ? "text-rose-600 font-semibold" : "text-gray-400"}`}>{p.overdue || "–"}</td>
                <td className="px-2 py-2.5 text-center text-gray-700">{p.reviews || "–"}</td>
                <td className="px-2 py-2.5 text-center text-gray-700">{p.done_last_7 || "–"}</td>
                <td className="px-2 py-2.5 text-xs text-gray-600">
                  {p.away_until ? <span className="flex items-center gap-1 text-amber-700"><Plane size={11} /> until {p.away_until.slice(5)}</span>
                    : p.away_this_week ? `${p.away_this_week}d this week`
                    : p.away_next_week ? `${p.away_next_week}d next week` : "–"}
                </td>
                <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${LOAD[p.load].chip}`}>{LOAD[p.load].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">"Stretched" means much more open work than the group's usual ({data.median_open ?? 0} open), or 3+ overdue; days off count against capacity.</p>
    </div>
  );
}
