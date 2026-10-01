import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Trash2, Crown, LogOut, Search } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace, getStoredUser, switchWorkspace } from "../api/api";
import { ROLE_LABELS } from "../utils/workspace";
import CompanyStructure from "../components/CompanyStructure";
import OrgChart from "../components/OrgChart";
import CompanyInvites from "../components/CompanyInvites";
import OnboardingChecklists from "../components/OnboardingChecklists";
import CompanyMoves from "../components/CompanyMoves";
import AiUsage from "../components/AiUsage";

// Before someone goes: show their open work and who should take it over
function HandOver({ company, person, members, onDone, onCancel }) {
  const [work, setWork] = useState(null);
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const leaving = person.id === getStoredUser()?.id;

  useEffect(() => {
    apiRequest(`/companies/${company.id}/members/${person.id}/open-work`).then(setWork).catch(() => setWork({ tasks: [], reviewing: 0 }));
  }, [company.id, person.id]);

  const go = async () => {
    setError("");
    try {
      const body = { reassign_to: to || null };
      if (leaving) await apiRequest(`/companies/${company.id}/leave`, "POST", body);
      else await apiRequest(`/companies/${company.id}/members/${person.id}`, "DELETE", body);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  const open = work?.tasks.length || 0;
  return (
    <div className="bg-white border border-rose-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900">{leaving ? `Leave ${company.name}` : `Remove ${person.name || person.email}`}</p>
      {!work ? (
        <p className="text-xs text-gray-400">Checking open work…</p>
      ) : open || work.reviewing ? (
        <>
          <p className="text-sm text-gray-600">
            {leaving ? "You have" : "They have"} {open} open {open === 1 ? "task" : "tasks"}
            {work.reviewing > 0 && <> and {work.reviewing} to review</>}.
          </p>
          {open > 0 && (
            <ul className="text-xs text-gray-500 max-h-32 overflow-y-auto list-disc pl-5">
              {work.tasks.slice(0, 20).map((t) => <li key={t.id}>{t.title}{t.team_name && <> · {t.team_name}</>}{t.due_date && <> · due {t.due_date}</>}</li>)}
            </ul>
          )}
          <select className={`${inputCls} w-full`} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Leave them assigned (marked "former member")</option>
            {members.filter((m) => m.id !== person.id && m.status === "active" && !["guest", "viewer"].includes(m.role)).map((m) => (
              <option key={m.id} value={m.id}>Hand over to {m.name || m.email}</option>
            ))}
          </select>
        </>
      ) : (
        <p className="text-sm text-gray-600">No open work to hand over.</p>
      )}
      <p className="text-xs text-gray-400">Finished tasks stay under {leaving ? "your" : "their"} name. Personal dones are never touched.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={go} className="px-3 py-1.5 bg-rose-600 text-white text-sm rounded-md">{leaving ? "Leave company" : "Remove"}</button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
      </div>
    </div>
  );
}

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const ROLES = ["admin", "manager", "member", "guest", "viewer"];
const ROLE_HELP = {
  owner: "Everything, including deleting the company",
  admin: "Settings, roles, teams, audit log",
  manager: "Invites people, runs their department",
  member: "Works in their teams",
  guest: "Only projects shared with them",
  viewer: "Read-only",
};

// ── General settings ─────────────────────────────────────────────────────────
function General({ company, types, onSaved }) {
  const [form, setForm] = useState({
    name: company.name,
    work_type: company.work_type,
    email_domain: company.email_domain || "",
    domain_join: company.domain_join,
  });
  const [msg, setMsg] = useState("");
  const canEdit = ["owner", "admin"].includes(company.my_role);

  const save = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const data = await apiRequest(`/companies/${company.id}`, "PUT", form);
      onSaved(data);
      setMsg("Saved");
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <form onSubmit={save} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 max-w-xl">
      <fieldset disabled={!canEdit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input className={`${inputCls} w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kind of work (columns for new projects)</label>
          <select className={`${inputCls} w-full`} value={form.work_type} onChange={(e) => setForm({ ...form, work_type: e.target.value })}>
            {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Company email domain</label>
          <input className={`${inputCls} w-full`} placeholder="acme.com" value={form.email_domain}
            onChange={(e) => setForm({ ...form, email_domain: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">People who sign up with that domain</label>
          <select className={`${inputCls} w-full`} value={form.domain_join} onChange={(e) => setForm({ ...form, domain_join: e.target.value })}>
            <option value="off">Can't join by domain (invite only)</option>
            <option value="request">Can ask to join; an admin approves</option>
            <option value="auto">Join straight away as Member</option>
          </select>
        </div>
      </fieldset>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">Save</button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Only owners and admins change these.</p>
      )}
    </form>
  );
}

// ── Members ──────────────────────────────────────────────────────────────────
function Members({ company }) {
  const me = getStoredUser();
  const [members, setMembers] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState("");
  const [showFormer, setShowFormer] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const isAdmin = ["owner", "admin"].includes(company.my_role);
  const canLabel = isAdmin || company.my_role === "manager";

  const load = useCallback(
    () =>
      apiRequest(`/companies/${company.id}/members${showFormer ? "?former=1" : ""}`)
        .then(setMembers)
        .catch((err) => setError(err.message)),
    [company.id, showFormer]
  );
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiRequest(`/companies/${company.id}/departments`).then(setDepartments).catch(() => {});
  }, [company.id]);

  const update = async (userId, body) => {
    setError("");
    try {
      await apiRequest(`/companies/${company.id}/members/${userId}`, "PUT", body);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = (m) => setRemoving(m);

  if (error && !members) return <p className="text-sm text-gray-500">{error}</p>;
  if (!members) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;

  const q = query.toLowerCase();
  const shown = members.filter((m) =>
    `${m.name || ""} ${m.email} ${m.job_title || ""} ${(m.skills || []).join(" ")}`.toLowerCase().includes(q)
  );
  const deptOf = (id) => departments.find((d) => d.id === id)?.name;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || members.find((m) => m.id === id)?.email || "—";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Search name, title or skill" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={showFormer} onChange={(e) => setShowFormer(e.target.checked)} />
            Show former members
          </label>
        )}
        <span className="text-xs text-gray-400">{shown.length} people</span>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {removing && (
        <div className="mb-3">
          <HandOver company={company} person={removing} members={members}
            onDone={() => { setRemoving(null); load(); }} onCancel={() => setRemoving(null)} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {shown.map((m) => {
          const isOwner = m.role === "owner";
          const left = m.status === "left";
          return (
            <div key={m.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 ${left ? "opacity-50" : ""}`}>
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                {(m.name || m.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-medium text-gray-900">
                  {m.name || m.email}
                  {m.id === me?.id && <span className="text-xs text-gray-400 font-normal"> (you)</span>}
                  {left && <span className="text-xs text-gray-400 font-normal"> · former member</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {[m.job_title, m.level, deptOf(m.department_id)].filter(Boolean).join(" · ") || m.email}
                  {m.manager_id && <> · reports to {nameOf(m.manager_id)}</>}
                </p>
                {m.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.skills.map((s) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{s}</span>)}
                  </div>
                )}
              </div>

              {(canLabel || m.id === me?.id) && !left && (
                <input
                  className={`${inputCls} w-36 text-xs py-1.5`}
                  defaultValue={m.job_title || ""}
                  placeholder="Job title"
                  onBlur={(e) => e.target.value !== (m.job_title || "") && update(m.id, { job_title: e.target.value })}
                />
              )}
              {(canLabel || m.id === me?.id) && !left && (
                <input
                  className={`${inputCls} w-24 text-xs py-1.5`}
                  defaultValue={m.level || ""}
                  placeholder="Level"
                  onBlur={(e) => e.target.value !== (m.level || "") && update(m.id, { level: e.target.value })}
                />
              )}
              {(canLabel || m.id === me?.id) && !left && (
                <input
                  className={`${inputCls} w-40 text-xs py-1.5`}
                  defaultValue={(m.skills || []).join(", ")}
                  placeholder="Skills, comma separated"
                  onBlur={(e) => {
                    const skills = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                    if (skills.join(",").toLowerCase() !== (m.skills || []).join(",")) update(m.id, { skills });
                  }}
                />
              )}
              {canLabel && !left && departments.length > 0 && (
                <select className={`${inputCls} w-36 text-xs py-1.5`} value={m.department_id || ""}
                  onChange={(e) => update(m.id, { department_id: e.target.value || null })} title="Department">
                  <option value="">No department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              {canLabel && !left && (
                <select className={`${inputCls} w-40 text-xs py-1.5`} value={m.manager_id || ""}
                  onChange={(e) => update(m.id, { manager_id: e.target.value || null })} title="Reports to">
                  <option value="">No manager</option>
                  {members.filter((x) => x.id !== m.id && x.status === "active").map((x) => (
                    <option key={x.id} value={x.id}>{x.name || x.email}</option>
                  ))}
                </select>
              )}

              {isAdmin && !isOwner && !left ? (
                <select className={`${inputCls} text-xs py-1.5`} value={m.role} onChange={(e) => update(m.id, { role: e.target.value })}
                  title={ROLE_HELP[m.role]}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              ) : (
                <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600 flex items-center gap-1" title={ROLE_HELP[m.role]}>
                  {isOwner && <Crown size={11} />}
                  {ROLE_LABELS[m.role]}
                </span>
              )}
              {isAdmin && !isOwner && !left && m.id !== me?.id && (
                <button onClick={() => remove(m)} className="p-1.5 text-gray-300 hover:text-rose-500" title="Remove from company">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid sm:grid-cols-3 gap-2 text-xs text-gray-500">
        {Object.entries(ROLE_HELP).map(([r, help]) => (
          <p key={r}><b className="text-gray-700">{ROLE_LABELS[r]}</b>: {help}</p>
        ))}
      </div>
    </div>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────
const ACTION_LABELS = {
  "company.created": "created the company",
  "company.updated": "changed company settings",
  "company.ownership_transferred": "handed over ownership",
  "member.role_changed": "changed a role",
  "member.updated": "edited a profile",
  "member.removed": "removed a member",
  "member.left": "left the company",
  "member.joined": "joined",
  "team.created": "created a team",
  "team.deleted": "deleted a team",
  "project.created": "created a project",
  "department.created": "created a department",
  "department.updated": "changed a department",
  "department.deleted": "deleted a department",
  "team.moved": "moved a team",
  "invite.sent": "sent an invite",
  "invite.revoked": "cancelled an invite",
  "join_request.denied": "declined a join request",
  "onboarding.created": "created an onboarding checklist",
  "onboarding.updated": "changed an onboarding checklist",
  "onboarding.assigned": "gave someone an onboarding checklist",
  "project.member_added": "added someone to a project",
  "project.member_removed": "removed someone from a project",
  "project.columns_changed": "changed a project's columns",
  "transfer.requested": "asked for a team move",
  "transfer.approved": "approved a team move",
  "transfer.rejected": "declined a team move",
  "transfer.cancelled": "cancelled a team move",
  "member.transferred": "moved someone to another team",
  "announcement.posted": "posted an announcement",
};

function Audit({ company }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    apiRequest(`/companies/${company.id}/audit`).then(setRows).catch(() => setRows([]));
  }, [company.id]);
  if (!rows) return <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />;
  const kinds = [...new Set(rows.map((r) => r.action.split(".")[0]))].sort();
  const shown = filter ? rows.filter((r) => r.action.startsWith(`${filter}.`)) : rows;
  return (
    <div>
    {kinds.length > 1 && (
      <select className={`${inputCls} mb-3`} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">Everything</option>
        {kinds.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
      </select>
    )}
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {shown.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">Nothing recorded yet.</p>}
      {shown.map((r) => (
        <div key={r.id} className="px-4 py-2.5 flex items-start justify-between gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-900">{r.actor?.name || r.actor?.email || "Someone"}</span>{" "}
            <span className="text-gray-600">{ACTION_LABELS[r.action] || r.action}</span>
            {r.details && Object.keys(r.details).length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5 break-all">
                {Object.entries(r.details).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ")}
              </p>
            )}
          </div>
          <span className="text-xs text-gray-400 shrink-0">{new Date(r.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
    </div>
  );
}

// ── Leave / hand over / delete ───────────────────────────────────────────────
function Danger({ company }) {
  const [members, setMembers] = useState([]);
  const [leaving, setLeaving] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const isOwner = company.my_role === "owner";
  const me = getStoredUser();

  useEffect(() => {
    if (company.my_role !== "guest") apiRequest(`/companies/${company.id}/members`).then(setMembers).catch(() => {});
  }, [company.id, company.my_role]);

  const run = async (fn, after) => {
    setMsg("");
    try {
      await fn();
      after();
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {isOwner && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900">Hand over ownership</h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">You become an admin. Needed before the owner can leave.</p>
          <div className="flex gap-2">
            <select className={`${inputCls} flex-1`} value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
              <option value="">Pick a member</option>
              {members.filter((m) => m.id !== me?.id && !["guest", "viewer"].includes(m.role)).map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email} ({ROLE_LABELS[m.role]})</option>
              ))}
            </select>
            <button disabled={!newOwner} className="px-3 py-2 border border-gray-200 text-sm rounded-md hover:bg-gray-50 disabled:opacity-50"
              onClick={() => window.confirm("Hand over ownership?") &&
                run(() => apiRequest(`/companies/${company.id}/transfer-ownership`, "POST", { user_id: newOwner }), () => window.location.reload())}>
              Hand over
            </button>
          </div>
        </div>
      )}

      {!isOwner && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900">Leave {company.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">Your tasks stay in the company under your name, marked as a former member.</p>
          {leaving ? (
            <HandOver company={company} person={{ id: me?.id, name: me?.name, email: me?.email }} members={members}
              onDone={() => switchWorkspace("")} onCancel={() => setLeaving(false)} />
          ) : (
            <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-sm rounded-md hover:bg-gray-50"
              onClick={() => setLeaving(true)}>
              <LogOut size={14} /> Leave company
            </button>
          )}
        </div>
      )}

      {isOwner && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-rose-700">Delete company</h3>
          <p className="text-xs text-rose-700 mt-0.5 mb-3">Deletes every team, project and company task. Personal dones are not affected. This can't be undone.</p>
          <div className="flex gap-2">
            <input className={`${inputCls} flex-1`} placeholder={`Type "${company.name}"`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button disabled={confirm !== company.name} className="px-3 py-2 bg-rose-600 text-white text-sm rounded-md disabled:opacity-40"
              onClick={() => run(() => apiRequest(`/companies/${company.id}`, "DELETE", { confirm }), () => switchWorkspace(""))}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CompanyPage() {
  const id = getWorkspace();
  const [company, setCompany] = useState(null);
  const [types, setTypes] = useState([]);
  const [tab, setTab] = useState("members");

  useEffect(() => {
    if (!id) return;
    apiRequest(`/companies/${id}`).then(setCompany).catch(() => setCompany(false));
    apiRequest("/companies/work-types").then(setTypes).catch(() => {});
  }, [id]);

  if (!id) return <Navigate to="/companies/new" replace />;
  if (company === false) return <p className="p-8 text-sm text-gray-500">Couldn't load this company.</p>;
  if (!company)
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );

  const isAdmin = ["owner", "admin"].includes(company.my_role);
  const tabs = [
    ["members", "People"],
    ...(company.my_role !== "guest" ? [["structure", "Structure"], ["org", "Org chart"], ["moves", "Moves"]] : []),
    ...(isAdmin || company.my_role === "manager" ? [["invites", "Invites"], ["onboarding", "Onboarding"]] : []),
    ["general", "Settings"],
    ...(isAdmin ? [["audit", "Audit log"], ["ai", "AI usage"]] : []),
    ["danger", company.my_role === "owner" ? "Ownership" : "Leave"],
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{company.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {company.member_count} {company.member_count === 1 ? "person" : "people"} · {company.team_count}{" "}
          {company.team_count === 1 ? "team" : "teams"} · you are {ROLE_LABELS[company.my_role]}
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${tab === key ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "members" && (company.my_role === "guest"
        ? <p className="text-sm text-gray-500">Guests only see the projects shared with them.</p>
        : <Members company={company} />)}
      {tab === "structure" && <CompanyStructure company={company} />}
      {tab === "org" && <OrgChart company={company} />}
      {tab === "moves" && <CompanyMoves company={company} />}
      {tab === "invites" && <CompanyInvites company={company} />}
      {tab === "onboarding" && <OnboardingChecklists company={company} />}
      {tab === "general" && <General company={company} types={types} onSaved={(c) => setCompany({ ...company, ...c })} />}
      {tab === "audit" && <Audit company={company} />}
      {tab === "ai" && <AiUsage company={company} />}
      {tab === "danger" && <Danger company={company} />}
    </div>
  );
}
