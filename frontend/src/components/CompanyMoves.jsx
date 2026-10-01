import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";
import { localDate } from "../utils/date";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  cancelled: "bg-gray-100 text-gray-500",
};
const who = (u) => u?.name || u?.email;

// Moving people between teams: ask, approve, and it happens on the chosen date
export default function CompanyMoves({ company }) {
  const me = getStoredUser();
  const approver = ["owner", "admin", "manager"].includes(company.my_role);
  const [org, setOrg] = useState(null);
  const [moves, setMoves] = useState(null);
  const blank = { user_id: me?.id, from_team_id: "", to_team_id: "", effective_date: localDate(), task_plan: "keep", reassign_to: "", note: "" };
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiRequest(`/companies/${company.id}/transfers`).then(setMoves).catch((err) => setError(err.message));
  }, [company.id]);
  useEffect(() => {
    load();
    apiRequest(`/companies/${company.id}/org`).then(setOrg).catch(() => {});
  }, [company.id, load]);

  const run = async (fn, after) => {
    setError("");
    setMsg("");
    try {
      const out = await fn();
      after?.(out);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!org || !moves) return error ? <p className="text-sm text-gray-500">{error}</p> : <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;

  const person = org.people.find((p) => p.id === form.user_id);
  const theirTeams = org.teams.filter((t) => person?.team_ids.includes(t.id));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const teamName = (id) => org.teams.find((t) => t.id === id)?.name;

  const submit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || null]));
    run(() => apiRequest(`/companies/${company.id}/transfers`, "POST", body), (t) => {
      setMsg(t.status === "completed" ? "Done — the move has happened." : t.status === "approved" ? `Approved for ${t.effective_date}.` : "Sent for approval.");
      setForm(blank);
    });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">{approver ? "Move someone to another team" : "Ask to move to another team"}</h3>
        <div className="flex flex-wrap gap-2 items-center">
          {approver ? (
            <select className={`${inputCls} flex-1 min-w-[160px]`} value={form.user_id} onChange={(e) => set({ user_id: e.target.value, from_team_id: "" })}>
              {org.people.filter((p) => !["guest", "viewer"].includes(p.role)).map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </select>
          ) : (
            <span className="text-sm text-gray-700">You</span>
          )}
          <select className={`${inputCls} flex-1 min-w-[140px]`} value={form.from_team_id} onChange={(e) => set({ from_team_id: e.target.value })}>
            <option value="">{theirTeams.length ? "Keep current teams" : "Not on a team"}</option>
            {theirTeams.map((t) => <option key={t.id} value={t.id}>Leaving {t.name}</option>)}
          </select>
          <ArrowRight size={14} className="text-gray-400" />
          <select required className={`${inputCls} flex-1 min-w-[140px]`} value={form.to_team_id} onChange={(e) => set({ to_team_id: e.target.value })}>
            <option value="">Joining team…</option>
            {org.teams.filter((t) => !person?.team_ids.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-gray-500 flex items-center gap-2">
            From
            <input type="date" className={inputCls} value={form.effective_date} onChange={(e) => set({ effective_date: e.target.value })} />
          </label>
          {form.from_team_id && (
            <>
              <select className={inputCls} value={form.task_plan} onChange={(e) => set({ task_plan: e.target.value })}>
                <option value="keep">Keep their open {teamName(form.from_team_id)} tasks</option>
                <option value="reassign">Hand open {teamName(form.from_team_id)} tasks to…</option>
              </select>
              {form.task_plan === "reassign" && (
                <select required className={inputCls} value={form.reassign_to} onChange={(e) => set({ reassign_to: e.target.value })}>
                  <option value="">Pick a person</option>
                  {org.people.filter((p) => p.id !== form.user_id && !["guest", "viewer"].includes(p.role)).map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.email}</option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
        <input className={`${inputCls} w-full`} placeholder="Note (optional), e.g. why or what to hand over" value={form.note} onChange={(e) => set({ note: e.target.value })} />
        <div className="flex items-center gap-3">
          <button className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">{approver ? "Move" : "Ask"}</button>
          {msg && <span className="text-xs text-emerald-600">{msg}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        <p className="text-xs text-gray-400">Moves need a manager or admin to approve. They happen on the date you pick; finished tasks always stay under the person's name.</p>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">{approver ? "Moves" : "Your moves"}</h3>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {moves.length === 0 && <p className="p-4 text-sm text-gray-400">No moves yet.</p>}
          {moves.map((t) => (
            <div key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm text-gray-900">
                  <b className="font-medium">{who(t.person)}</b>: {t.from_team?.name || "—"} → {t.to_team?.name}
                </p>
                <p className="text-xs text-gray-500">
                  {t.effective_date}
                  {t.task_plan === "reassign" && <> · open tasks to {who(t.reassignee)}</>}
                  {t.tasks_moved > 0 && <> · {t.tasks_moved} handed over</>}
                  {t.requester && t.requested_by !== t.user_id && <> · asked by {who(t.requester)}</>}
                  {t.note && <> · “{t.note}”</>}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status]}`}>{t.status}</span>
              {t.can_decide && (
                <>
                  <button className="px-2.5 py-1 bg-gray-900 text-white text-xs rounded-md"
                    onClick={() => run(() => apiRequest(`/companies/${company.id}/transfers/${t.id}/decide`, "POST", { decision: "approve" }))}>Approve</button>
                  <button className="px-2.5 py-1 border border-gray-200 text-xs rounded-md hover:bg-gray-50"
                    onClick={() => run(() => apiRequest(`/companies/${company.id}/transfers/${t.id}/decide`, "POST", { decision: "reject" }))}>Decline</button>
                </>
              )}
              {["pending", "approved"].includes(t.status) && (t.user_id === me?.id || t.requested_by === me?.id || approver) && (
                <button className="text-xs text-gray-400 hover:text-gray-700"
                  onClick={() => run(() => apiRequest(`/companies/${company.id}/transfers/${t.id}/cancel`, "POST"))}>Cancel</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
