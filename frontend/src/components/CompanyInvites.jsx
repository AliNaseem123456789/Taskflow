import { useCallback, useEffect, useState } from "react";
import { Check, Mail, Trash2, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import { ROLE_LABELS } from "../utils/workspace";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";

// Invite people by email, see who's pending, and answer "ask to join" requests.
// Admins and managers; managers can't hand out Admin or Manager.
export default function CompanyInvites({ company }) {
  const isAdmin = ["owner", "admin"].includes(company.my_role);
  const roles = isAdmin ? ["member", "manager", "admin", "guest", "viewer"] : ["member", "guest", "viewer"];
  const blank = { email: "", role: "member", team_id: "", project_id: "", template_id: "" };
  const [form, setForm] = useState(blank);
  const [invites, setInvites] = useState(null);
  const [requests, setRequests] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [decision, setDecision] = useState({}); // requestId -> { role, team_id }
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiRequest(`/companies/${company.id}/invites`).then(setInvites).catch((err) => setError(err.message));
    apiRequest(`/companies/${company.id}/join-requests`).then(setRequests).catch(() => {});
  }, [company.id]);
  useEffect(() => {
    load();
    apiRequest(`/companies/${company.id}/org`).then((o) => setTeams(o.teams)).catch(() => {});
    apiRequest("/teams/projects/mine").then(setProjects).catch(() => {});
    apiRequest(`/companies/${company.id}/onboarding`).then(setTemplates).catch(() => {});
  }, [company.id, load]);

  const run = async (fn, done) => {
    setError("");
    setMsg("");
    try {
      const out = await fn();
      done?.(out);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const send = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || null]));
    run(() => apiRequest(`/companies/${company.id}/invites`, "POST", body), (inv) => {
      setMsg(inv.email_sent ? `Invite emailed to ${inv.email}` : `Invite created for ${inv.email} (email isn't set up, so it wasn't sent)`);
      setForm({ ...blank, role: form.role });
    });
  };

  const isGuest = form.role === "guest";
  const defaults = templates.filter((t) => t.is_default).map((t) => t.name);

  return (
    <div className="space-y-5 max-w-3xl">
      <form onSubmit={send} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Invite someone</h3>
        <div className="flex flex-wrap gap-2">
          <input type="email" required className={`${inputCls} flex-1 min-w-[220px]`} placeholder="name@example.com"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className={inputCls} value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value, team_id: e.target.value === "guest" ? "" : form.team_id })}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isGuest && (
            <select className={`${inputCls} flex-1 min-w-[160px]`} value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
              <option value="">No team yet</option>
              {teams.map((t) => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
          )}
          <select className={`${inputCls} flex-1 min-w-[160px]`} value={form.project_id} required={isGuest}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
            <option value="">{isGuest ? "Pick a project (required for guests)" : "No extra project"}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>Project: {p.name}</option>)}
          </select>
          <select className={`${inputCls} flex-1 min-w-[160px]`} value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
            <option value="">{defaults.length ? `Onboarding: default (${defaults.join(", ")})` : "No onboarding checklist"}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>Onboarding: {t.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">
            <Mail size={14} /> Send invite
          </button>
          {msg && <span className="text-xs text-emerald-600">{msg}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        <p className="text-xs text-gray-400">The link works for 7 days. Guests only see the project you pick.</p>
      </form>

      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Asking to join ({requests.length})</h3>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {requests.map((r) => {
              const d = decision[r.id] || { role: "member", team_id: "" };
              const set = (patch) => setDecision({ ...decision, [r.id]: { ...d, ...patch } });
              return (
                <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-medium text-gray-900">{r.user?.name || r.user?.email}</p>
                    <p className="text-xs text-gray-500">{r.user?.email}{r.message && <> · “{r.message}”</>}</p>
                  </div>
                  <select className={`${inputCls} text-xs py-1.5`} value={d.role} onChange={(e) => set({ role: e.target.value })}>
                    {(isAdmin ? ["member", "manager", "admin", "viewer"] : ["member", "viewer"]).map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}
                  </select>
                  <select className={`${inputCls} text-xs py-1.5`} value={d.team_id} onChange={(e) => set({ team_id: e.target.value })}>
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button title="Approve" className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-md"
                    onClick={() => run(() => apiRequest(`/companies/${company.id}/join-requests/${r.id}`, "POST", { decision: "approve", role: d.role, team_id: d.team_id || null }))}>
                    <Check size={12} /> Approve
                  </button>
                  <button title="Decline" className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50"
                    onClick={() => run(() => apiRequest(`/companies/${company.id}/join-requests/${r.id}`, "POST", { decision: "deny" }))}>
                    <X size={12} /> Decline
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Pending invites</h3>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {invites === null && <p className="p-4 text-sm text-gray-400">Loading…</p>}
          {invites?.length === 0 && <p className="p-4 text-sm text-gray-400">No pending invites.</p>}
          {invites?.map((i) => (
            <div key={i.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{i.email}</p>
                <p className="text-xs text-gray-500">
                  {[ROLE_LABELS[i.role], i.team_name && `team ${i.team_name}`, i.project_name && `project ${i.project_name}`].filter(Boolean).join(" · ")}
                  {" · "}expires {new Date(i.expires_at).toLocaleDateString()}
                </p>
              </div>
              <button className="p-1.5 text-gray-300 hover:text-rose-500" title="Cancel invite"
                onClick={() => run(() => apiRequest(`/companies/${company.id}/invites/${i.id}`, "DELETE"))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {company.domain_join === "off" && isAdmin && (
        <p className="text-xs text-gray-400">Tip: in Settings you can let people with your company email join without an invite.</p>
      )}
    </div>
  );
}
