import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { apiRequest } from "../utils/api";
import { aiRequest, useAI } from "../utils/ai";
import { getWorkspace } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import { useMyProjects } from "../utils/projects";
import AreaTile from "../components/AreaTile";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const EXAMPLES = [
  "Releases keep slipping and nobody knows why",
  "One person seems to be doing everything",
  "Too many things are 'in progress' and nothing finishes",
  "I keep putting off the same tasks",
];

// "Solve a team problem": describe what's wrong; the AI looks at the facts you can see
// (workload, overdue and blocked work, project health, time off) and suggests a plan.
export default function SolveProblem() {
  const ai = useAI();
  const companyId = getWorkspace();
  const { teams } = useCompanyPeople();
  const projects = useMyProjects();
  const [problem, setProblem] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState(null);
  const [keep, setKeep] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  if (!ai.on && !ai.checking) return <Navigate to="/dashboard" replace />;

  const solve = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await aiRequest("/api/solve", { problem, team_id: teamId || null, project_id: projectId || null });
      setResult(r);
      setKeep(Object.fromEntries(r.tasks.map((_, i) => [i, true])));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createTasks = async () => {
    let n = 0;
    for (const [i, t] of result.tasks.entries()) {
      if (!keep[i]) continue;
      const body = {
        title: t.title, description: t.description || undefined, priority: t.priority, status: "Doing",
        ...(t.due_date ? { due_date: t.due_date } : {}),
        ...(companyId && t.assignee_id ? { assignee_id: t.assignee_id } : {}),
        ...(companyId && projectId ? { project_id: projectId } : companyId && teamId ? { team_id: teamId } : {}),
      };
      if (await apiRequest("/tasks", "POST", body).then(() => true).catch(() => false)) n++;
    }
    setMsg(`Created ${n} task${n === 1 ? "" : "s"}.`);
  };

  const saveToWiki = async () => {
    const body = [
      `**Problem:** ${problem}`, "", `**What's going on:** ${result.diagnosis}`, "",
      result.causes.length ? "## Likely causes" : "", ...result.causes.map((c) => `- ${c.cause} — ${c.evidence}`), "",
      "## Plan", ...result.plan.map((p, i) => `${i + 1}. ${p.step} — ${p.why}`), "",
      result.questions.length ? "## Questions for the team" : "", ...result.questions.map((q) => `- ${q}`), "",
      result.watch.length ? "## How we'll know it's working" : "", ...result.watch.map((w) => `- ${w}`),
    ].join("\n");
    try {
      await apiRequest("/wiki", "POST", { title: `Plan: ${problem.slice(0, 80)}`, body, team_id: teamId || null });
      setMsg("Saved as a wiki page.");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-5">
      <div>
        <h1 className="page-title"><AreaTile /> Solve a problem</h1>
        <p className="text-sm text-gray-500 mt-1">
          Describe what's not working. The AI looks at the work you can see {companyId ? "— workload, overdue and blocked tasks, project health, time off —" : "(your own tasks)"} and suggests what to change.
        </p>
      </div>

      <form onSubmit={solve} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <textarea required minLength={5} rows={3} className={`${inputCls} w-full`} value={problem} onChange={(e) => setProblem(e.target.value)}
          placeholder="e.g. Our releases keep slipping, and the last two sprints ended with half the work unfinished." />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setProblem(ex)} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400">{ex}</button>
          ))}
        </div>
        {companyId && (
          <div className="flex flex-wrap gap-2">
            <select className={inputCls} value={teamId} onChange={(e) => { setTeamId(e.target.value); setProjectId(""); }}>
              <option value="">Whole company (what I can see)</option>
              {teams.map((t) => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
            <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Any project</option>
              {projects.filter((p) => !teamId || p.team_id === teamId).map((p) => <option key={p.id} value={p.id}>Project: {p.name}</option>)}
            </select>
          </div>
        )}
        <button disabled={busy || problem.trim().length < 5} className="flex items-center gap-1.5 px-4 py-2 btn-accent text-sm rounded-md disabled:opacity-50">
          <Sparkles size={14} /> {busy ? "Looking at your work…" : "Find a way forward"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {result && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-500 mb-1">What's likely going on</p>
            <p className="text-sm text-gray-900 leading-relaxed">{result.diagnosis}</p>
            {result.causes.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {result.causes.map((c, i) => (
                  <li key={i} className="text-sm text-gray-700"><b className="font-medium">{c.cause}</b> <span className="text-gray-500">— {c.evidence}</span></li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-gray-400 mt-3">
              Based on {result.facts_used.open_tasks} open tasks ({result.facts_used.overdue} overdue)
              {result.facts_used.people ? `, ${result.facts_used.people} people` : ""}{result.facts_used.projects ? `, ${result.facts_used.projects} project updates` : ""}.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-500 mb-2">Plan</p>
            <ol className="space-y-2">
              {result.plan.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full btn-accent text-[11px] flex items-center justify-center shrink-0">{i + 1}</span>
                  <span><span className="text-gray-900">{p.step}</span> <span className="text-gray-500">— {p.why}</span></span>
                </li>
              ))}
            </ol>
          </div>

          {result.tasks.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
              <p className="text-xs font-medium text-gray-500">Tasks to start with</p>
              {result.tasks.map((t, i) => (
                <label key={i} className="flex items-start gap-2 text-sm text-gray-800">
                  <input type="checkbox" className="mt-1" checked={!!keep[i]} onChange={() => setKeep({ ...keep, [i]: !keep[i] })} />
                  <span>
                    {t.title}
                    <span className="text-xs text-gray-400">{[t.assignee_name && `→ ${t.assignee_name}`, t.due_date && `due ${t.due_date}`, t.priority !== "medium" && t.priority].filter(Boolean).map((x) => ` · ${x}`)}</span>
                    {t.description && <span className="block text-xs text-gray-500">{t.description}</span>}
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={createTasks} className="flex items-center gap-1 px-3 py-1.5 btn-accent text-xs rounded-md"><Check size={12} /> Create selected tasks</button>
                {companyId && <button onClick={saveToWiki} className="px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50">Save the plan to the wiki</button>}
                {msg && <span className="text-xs text-emerald-700 self-center">{msg}</span>}
              </div>
            </div>
          )}

          {(result.questions.length > 0 || result.watch.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {result.questions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">Ask the team</p>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
              )}
              {result.watch.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">How you'll know it's working</p>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">{result.watch.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400">The AI only saw what you're allowed to see. Personal dones of other people are never included.</p>
        </div>
      )}
    </div>
  );
}
