import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import { useMyProjects } from "../utils/projects";

const selectCls = "text-sm px-3 py-2 border border-gray-200 rounded-md bg-white text-gray-900";
const fmtWeek = (w) => new Date(`${w}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const dash = (v, suffix = "") => (v === null || v === undefined ? "–" : `${v}${suffix}`);

function Tile({ label, value, note, tone }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone === "bad" ? "text-rose-600" : "text-gray-900"}`}>{value}</p>
      {note && <p className="text-[11px] text-gray-400 mt-0.5">{note}</p>}
    </div>
  );
}

// Tooltip in the app's own card style; text in ink colours, a swatch carries the series
function ChartTip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-900 mb-1">Week of {fmtWeek(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-gray-600">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="text-gray-900 font-medium">{p.value ?? "–"}{p.value !== null && unit ? ` ${unit}` : ""}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = { tick: { fill: "var(--viz-axis)", fontSize: 11 }, axisLine: false, tickLine: false };

function Table({ title, rows, nameOf, empty }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium text-right">Done</th>
              <th className="px-2 py-2 font-medium text-right">Added</th>
              <th className="px-2 py-2 font-medium text-right">Open</th>
              <th className="px-2 py-2 font-medium text-right">Overdue</th>
              <th className="px-2 py-2 font-medium text-right">Days to finish</th>
              <th className="px-4 py-2 font-medium text-right">On time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">{empty}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-gray-900">{nameOf(r)}</td>
                <td className="px-2 py-2 text-right text-gray-700">{r.completed}</td>
                <td className="px-2 py-2 text-right text-gray-700">{r.created}</td>
                <td className="px-2 py-2 text-right text-gray-700">{r.open}</td>
                <td className={`px-2 py-2 text-right ${r.overdue ? "text-rose-600 font-medium" : "text-gray-400"}`}>{r.overdue || "–"}</td>
                <td className="px-2 py-2 text-right text-gray-700">{dash(r.cycle_days)}</td>
                <td className="px-4 py-2 text-right text-gray-700">{dash(r.on_time_pct, "%")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Company analytics: throughput, speed and lateness by week, team, project and person
export default function Analytics() {
  const companyId = getWorkspace();
  const { teams } = useCompanyPeople();
  const projects = useMyProjects();
  const [days, setDays] = useState(90);
  const [team, setTeam] = useState("");
  const [project, setProject] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    const q = new URLSearchParams({ days });
    if (team) q.set("team_id", team);
    if (project) q.set("project_id", project);
    setError("");
    apiRequest(`/companies/${companyId}/analytics?${q}`).then(setData).catch((err) => setError(err.message));
  }, [companyId, days, team, project]);

  if (!companyId) return <Navigate to="/dashboard" replace />;
  const t = data?.totals;

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Company work only — personal dones are never counted.</p>
      </div>

      {/* filters, one row above every chart */}
      <div className="flex flex-wrap gap-2">
        <select className={selectCls} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          {[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        <select className={selectCls} value={team} onChange={(e) => { setTeam(e.target.value); setProject(""); }} aria-label="Team">
          <option value="">All teams</option>
          {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className={selectCls} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {projects.filter((p) => !team || p.team_id === team).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Tile label="Finished" value={t.completed} note={`last ${data.range.days} days`} />
            <Tile label="Added" value={t.created} note={`last ${data.range.days} days`} />
            <Tile label="Open now" value={t.open} />
            <Tile label="Overdue now" value={t.overdue} tone={t.overdue ? "bad" : undefined} />
            <Tile label="Days to finish" value={dash(t.cycle_days)} note="median, start → done" />
            <Tile label="On time" value={dash(t.on_time_pct, "%")} note="of finished tasks with a due date" />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Finished vs added, per week</h2>
                <div className="flex gap-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--viz-1)" }} /> Finished</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--viz-2)" }} /> Added</span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weekly} barGap={2} barCategoryGap="25%" margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                    <XAxis dataKey="week" tickFormatter={fmtWeek} {...axisProps} minTickGap={16} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--viz-grid)", opacity: 0.6 }} />
                    <Bar dataKey="completed" name="Finished" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="created" name="Added" fill="var(--viz-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">More added than finished week after week means the backlog is growing.</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Days from start to done (median), per week</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.weekly} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                    <XAxis dataKey="week" tickFormatter={fmtWeek} {...axisProps} minTickGap={16} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTip unit="days" />} cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "3 3" }} />
                    <Line type="monotone" dataKey="cycle_days" name="Days to finish" stroke="var(--viz-1)" strokeWidth={2} connectNulls
                      dot={{ r: 4, fill: "var(--viz-1)", stroke: "var(--color-white, #fff)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Weeks with nothing finished are skipped.</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Open work by priority</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.open_by_priority.map((p) => (
                <div key={p.priority}>
                  <p className="text-xs text-gray-500 capitalize">{p.priority}</p>
                  <p className="text-lg font-semibold text-gray-900">{p.count}</p>
                </div>
              ))}
            </div>
          </div>

          {!team && <Table title="By team" rows={data.teams} nameOf={(r) => r.name} empty="No team activity in this range." />}
          <Table title="By project" rows={data.projects} empty="No project activity in this range."
            nameOf={(r) => <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />{r.name}</span>} />
          <Table title="By person" rows={data.people} nameOf={(r) => r.name || r.email}
            empty="Nobody whose work you can see had activity in this range." />
        </>
      )}
    </div>
  );
}
