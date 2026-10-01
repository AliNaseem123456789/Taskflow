import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, Clock, EyeOff, MapPin, Pencil, Plus, Sparkles, Users } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser, getWorkspace } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import Markdown from "../components/Markdown";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const KIND = { full_time: "Full-time", part_time: "Part-time", project: "Project", gig: "Short gig" };
const STAGES = [
  ["applied", "Applied", "bg-gray-100 text-gray-700"],
  ["reviewing", "Reviewing", "bg-sky-50 text-sky-700"],
  ["interview", "Interview", "bg-violet-50 text-violet-700"],
  ["offer", "Offer", "bg-amber-50 text-amber-700"],
  ["hired", "Hired", "bg-emerald-50 text-emerald-700"],
  ["declined", "Declined", "bg-rose-50 text-rose-700"],
  ["withdrawn", "Withdrawn", "bg-gray-100 text-gray-500"],
];
const stage = (k) => STAGES.find((s) => s[0] === k) || STAGES[0];
const fmt = (d) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");

function StageChip({ status }) {
  const [, label, cls] = stage(status);
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function Skills({ skills, mine = [] }) {
  const set = new Set(mine);
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span key={s} className={`text-[11px] px-2 py-0.5 rounded-full ${set.has(s) ? "bg-emerald-50 text-emerald-700 font-medium" : "bg-gray-100 text-gray-600"}`}>{s}</span>
      ))}
    </div>
  );
}

function JobCard({ j, mine }) {
  return (
    <Link to={`/jobs/${j.id}`} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{j.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{[j.team?.name || "Company-wide", KIND[j.kind], j.level].filter(Boolean).join(" · ")}{j.visibility === "public" && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">Public</span>}</p>
        </div>
        {j.my_application ? <StageChip status={j.my_application.status} />
          : j.status !== "open" ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{j.status}</span>
          : j.match.score > 0 ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 shrink-0">{j.match.score}% match</span> : null}
      </div>
      {j.skills.length > 0 && <Skills skills={j.skills} mine={mine} />}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 mt-auto">
        {j.location && <span className="flex items-center gap-1"><MapPin size={11} /> {j.location}</span>}
        {j.closes_on && <span className="flex items-center gap-1"><Clock size={11} /> closes {fmt(j.closes_on)}</span>}
        {j.applicants !== undefined && (
          <span className={`flex items-center gap-1 ${j.new_applicants ? "text-gray-900 font-medium" : ""}`}><Users size={11} /> {j.applicants} applicant{j.applicants === 1 ? "" : "s"}{j.new_applicants ? ` · ${j.new_applicants} new` : ""}</span>
        )}
      </div>
    </Link>
  );
}

// Your skills on your company profile (what "Suggested for you" uses)
function MySkills({ companyId, skills, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(skills.join(", "));
  const save = async () => {
    await apiRequest(`/companies/${companyId}/members/${getStoredUser()?.id}`, "PUT", { skills: text.split(",").map((s) => s.trim()).filter(Boolean) });
    setEditing(false);
    onSaved();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
      <span>Your skills:</span>
      {editing ? (
        <>
          <input className={`${inputCls} py-1 text-xs w-72`} value={text} onChange={(e) => setText(e.target.value)} placeholder="react, sql, design…" aria-label="Your skills" />
          <button onClick={save} className="px-2.5 py-1 bg-gray-900 text-white rounded-md">Save</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          {skills.length ? <Skills skills={skills} mine={skills} /> : <span className="text-gray-400">none yet — add some to get matched to roles</span>}
          <button onClick={() => setEditing(true)} className="underline hover:text-gray-900">Edit</button>
        </>
      )}
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────
function Board({ companyId }) {
  const [data, setData] = useState(null);
  const [apps, setApps] = useState([]);
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    apiRequest(`/companies/${companyId}/jobs`).then(setData).catch((err) => setError(err.message));
    apiRequest(`/companies/${companyId}/my-applications`).then(setApps).catch(() => setApps([]));
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  const open = data.jobs.filter((j) => j.status === "open" && (!q || `${j.title} ${j.skills.join(" ")} ${j.team?.name || ""}`.toLowerCase().includes(q.toLowerCase())));
  const suggested = open.filter((j) => j.match.score >= 50 && !j.my_application && !j.can_manage).sort((a, b) => b.match.score - a.match.score).slice(0, 3);
  const rest = q ? open : open.filter((j) => !suggested.includes(j)); // suggested ones show once, above
  const hiring = data.jobs.filter((j) => j.can_manage);
  const tabs = [["open", `Open roles (${open.length})`], ["mine", `My applications (${apps.length})`], ...(hiring.length ? [["hiring", `Hiring (${hiring.length})`]] : [])];

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><BriefcaseBusiness size={20} /> Job board</h1>
          <p className="text-sm text-gray-500 mt-1">Open roles inside the company. Applying is confidential — only the hiring side sees it.</p>
        </div>
        {data.can_post && <Link to="/jobs/new" className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 shrink-0"><Plus size={14} /> Post a role</Link>}
      </div>
      <MySkills companyId={companyId} skills={data.my_skills} onSaved={load} />
      <div className="flex gap-6 border-b border-gray-200">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`pb-2 text-sm -mb-px border-b-2 ${tab === k ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-900"}`}>{l}</button>
        ))}
      </div>

      {tab === "open" && (
        <>
          <input className={`${inputCls} w-full sm:w-80`} placeholder="Search roles, skills, teams" value={q} onChange={(e) => setQ(e.target.value)} />
          {suggested.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Sparkles size={14} className="text-emerald-600" /> Suggested for you</p>
              <div className="grid sm:grid-cols-3 gap-3">{suggested.map((j) => <JobCard key={j.id} j={j} mine={data.my_skills} />)}</div>
            </div>
          )}
          {open.length === 0 && <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-400">No open roles right now.</div>}
          {suggested.length > 0 && rest.length > 0 && !q && <p className="text-sm font-semibold text-gray-900">More roles</p>}
          <div className="grid sm:grid-cols-2 gap-3">{rest.map((j) => <JobCard key={j.id} j={j} mine={data.my_skills} />)}</div>
        </>
      )}

      {tab === "mine" && (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
          {apps.length === 0 && <p className="p-8 text-center text-sm text-gray-400">You haven't applied to anything.</p>}
          {apps.map((a) => (
            <Link key={a.id} to={`/jobs/${a.posting.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <span className="flex-1 min-w-0">
                <span className="text-sm text-gray-900 block truncate">{a.posting.title}</span>
                <span className="text-xs text-gray-400">{a.posting.team?.name || "Company-wide"} · applied {fmt(a.created_at)}</span>
              </span>
              <StageChip status={a.status} />
            </Link>
          ))}
        </div>
      )}

      {tab === "hiring" && <div className="grid sm:grid-cols-2 gap-3">{hiring.map((j) => <JobCard key={j.id} j={j} mine={data.my_skills} />)}</div>}
    </div>
  );
}

// ── Post / edit ───────────────────────────────────────────────────────────────
function JobForm({ companyId, id }) {
  const navigate = useNavigate();
  const { teams, members } = useCompanyPeople();
  const me = getStoredUser()?.id;
  const [form, setForm] = useState(id ? null : {
    title: "", team_id: "", kind: "full_time", level: "", location: "", openings: 1, closes_on: "", skills: "", hiring_manager_id: me, description: "", visibility: "internal",
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    apiRequest(`/companies/${companyId}/jobs/${id}`).then((j) => setForm({
      ...j, team_id: j.team_id || "", level: j.level || "", location: j.location || "", closes_on: j.closes_on || "",
      skills: j.skills.join(", "), hiring_manager_id: j.hiring_manager_id || "", description: j.description || "",
    })).catch((err) => setError(err.message));
  }, [companyId, id]);
  if (!form) return <div className="p-8 text-sm text-gray-400">{error || "Loading…"}</div>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const body = {
      title: form.title, team_id: form.team_id || null, kind: form.kind, level: form.level, location: form.location,
      openings: Number(form.openings), closes_on: form.closes_on || null, hiring_manager_id: form.hiring_manager_id || null,
      description: form.description, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean), visibility: form.visibility,
    };
    try {
      const r = id ? await apiRequest(`/companies/${companyId}/jobs/${id}`, "PUT", body) : await apiRequest(`/companies/${companyId}/jobs`, "POST", body);
      navigate(`/jobs/${r.id}`);
    } catch (err) {
      setError(err.message);
    }
  };
  const label = "text-xs text-gray-500 block";
  return (
    <form onSubmit={save} className="p-6 lg:p-8 max-w-3xl space-y-5">
      <Link to={id ? `/jobs/${id}` : "/jobs"} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Back</Link>
      <h1 className="text-xl font-semibold text-gray-900">{id ? "Edit role" : "Post a role"}</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <input required className={`${inputCls} w-full text-base`} placeholder="Role title, e.g. Data engineer" value={form.title} onChange={set("title")} aria-label="Role title" />
        <div className="grid sm:grid-cols-3 gap-3">
          <label className={label}>Team
            <select className={`${inputCls} w-full mt-1`} value={form.team_id} onChange={set("team_id")} aria-label="Team">
              <option value="">Company-wide</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className={label}>Type
            <select className={`${inputCls} w-full mt-1`} value={form.kind} onChange={set("kind")}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className={label}>Level
            <input className={`${inputCls} w-full mt-1`} placeholder="e.g. Senior, L4" value={form.level} onChange={set("level")} />
          </label>
          <label className={label}>Location
            <input className={`${inputCls} w-full mt-1`} placeholder="Remote, Karachi office…" value={form.location} onChange={set("location")} />
          </label>
          <label className={label}>Openings
            <input type="number" min={1} max={50} className={`${inputCls} w-full mt-1`} value={form.openings} onChange={set("openings")} />
          </label>
          <label className={label}>Closes on (optional)
            <input type="date" className={`${inputCls} w-full mt-1`} value={form.closes_on} onChange={set("closes_on")} />
          </label>
        </div>
        <label className={label}>Skills (comma separated) — people with these get told about the role
          <input className={`${inputCls} w-full mt-1`} placeholder="sql, python, airflow" value={form.skills} onChange={set("skills")} aria-label="Skills" />
        </label>
        <label className={label}>Hiring manager
          <select className={`${inputCls} w-full mt-1`} value={form.hiring_manager_id} onChange={set("hiring_manager_id")}>
            {members.filter((m) => m.role !== "guest").map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </label>
        <label className={label}>Description (Markdown works: **bold**, lists, links)
          <textarea rows={8} className={`${inputCls} w-full mt-1`} placeholder="What the role is, what you'd work on, what we're looking for…" value={form.description} onChange={set("description")} />
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" className="mt-0.5" checked={form.visibility === "public"} onChange={(e) => setForm({ ...form, visibility: e.target.checked ? "public" : "internal" })} />
          <span>Show on our public page too<span className="block text-xs text-gray-500">People outside the company can find it and apply with their public profile. Needs the company's public page turned on.</span></span>
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">{id ? "Save" : "Post role"}</button>
    </form>
  );
}

// ── Role page ─────────────────────────────────────────────────────────────────
function Applicant({ a, companyId, onChange }) {
  const [note, setNote] = useState(a.hiring_note || "");
  const [error, setError] = useState("");
  const move = async (status) => {
    setError("");
    if (status === "hired" && !window.confirm(a.external
      ? `Hire ${a.user.name || "them"}? They'll get an invite to join the company.`
      : `Hire ${a.user.name || a.user.email}? If the role is on a team, their move to that team starts now.`)) return;
    try {
      await apiRequest(`/companies/${companyId}/applications/${a.id}`, "PUT", { status });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  };
  const final = ["hired", "withdrawn"].includes(a.status);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold shrink-0">{(a.user.name || a.user.email || "?")[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{a.user.name || a.user.email || a.profile?.handle}</p>
          <p className="text-xs text-gray-500">
            {a.external
              ? <>From outside{a.profile?.headline ? ` · ${a.profile.headline}` : ""}{a.profile && <> · <Link to={`/u/${a.profile.handle}`} className="underline">profile</Link></>}</>
              : <>{[a.job_title, a.level, a.teams.length ? `on ${a.teams.join(", ")}` : null].filter(Boolean).join(" · ") || "—"}{a.former_member && " · no longer in the company"}</>}
          </p>
        </div>
        <StageChip status={a.status} />
      </div>
      {a.skills.length > 0 && <Skills skills={a.skills} />}
      {a.note && <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-md px-3 py-2">{a.note}</p>}
      {a.tell_manager && <p className="text-[11px] text-gray-400">They told their manager.</p>}
      {!final && (
        <div className="flex flex-wrap gap-1.5">
          {STAGES.slice(0, 6).filter(([k]) => k !== a.status).map(([k, l]) => (
            <button key={k} onClick={() => move(k)} className={`text-xs px-2.5 py-1 rounded-md border ${k === "hired" ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50" : k === "declined" ? "border-gray-200 text-rose-600 hover:bg-rose-50" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
              {k === "hired" ? "Hire" : k === "declined" ? "Decline" : `→ ${l}`}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <EyeOff size={12} className="text-gray-300 shrink-0" />
        <input className="flex-1 text-xs px-2 py-1 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded outline-none bg-transparent text-gray-700" placeholder="Private note for the hiring side" value={note}
          onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (a.hiring_note || "") && apiRequest(`/companies/${companyId}/applications/${a.id}`, "PUT", { hiring_note: note }).catch(() => {})} aria-label="Hiring note" />
      </div>
      {a.transfer_id && <p className="text-[11px] text-emerald-700">Team move created — see Company → Moves.</p>}
      {a.external && a.status === "hired" && <p className="text-[11px] text-emerald-700">Invite sent — they join when they accept it.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function JobPage({ companyId, id }) {
  const navigate = useNavigate();
  const [j, setJ] = useState(null);
  const [note, setNote] = useState("");
  const [tell, setTell] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => apiRequest(`/companies/${companyId}/jobs/${id}`).then(setJ).catch((err) => setError(err.message)), [companyId, id]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn) => {
    setError("");
    try { await fn(); await load(); } catch (err) { setError(err.message); }
  };
  if (!j) return <div className="p-8 text-sm text-gray-400">{error || "Loading…"}</div>;
  const mine = j.my_application;
  const byStage = (k) => (j.applications || []).filter((a) => a.status === k);

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-5">
      <Link to="/jobs" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Job board</Link>
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{j.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{[j.team?.name || "Company-wide", KIND[j.kind], j.level, j.location].filter(Boolean).join(" · ")}</p>
            <p className="text-xs text-gray-400 mt-1">
              Hiring manager {j.hiring_manager?.name || j.hiring_manager?.email || "—"} · {j.openings} opening{j.openings === 1 ? "" : "s"}{j.closes_on ? ` · closes ${fmt(j.closes_on)}` : ""}
              {j.status !== "open" && <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{j.status}</span>}
            </p>
          </div>
          {j.can_manage && (
            <div className="flex gap-2">
              <Link to={`/jobs/${j.id}/edit`} className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50"><Pencil size={12} /> Edit</Link>
              <button onClick={() => act(() => apiRequest(`/companies/${companyId}/jobs/${j.id}`, "PUT", { status: j.status === "open" ? "closed" : "open" }))}
                className="px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50">{j.status === "open" ? "Close role" : "Reopen"}</button>
              <button onClick={() => window.confirm("Delete this role? Applicants still waiting are told.") && apiRequest(`/companies/${companyId}/jobs/${j.id}`, "DELETE").then(() => navigate("/jobs")).catch((err) => setError(err.message))}
                className="px-3 py-1.5 border border-gray-200 text-xs rounded-md text-rose-600 hover:bg-rose-50">Delete</button>
            </div>
          )}
        </div>
        {j.skills.length > 0 && (
          <div className="mt-3 space-y-1">
            <Skills skills={j.skills} mine={j.match.shared} />
            {!j.can_manage && j.match.shared.length > 0 && <p className="text-[11px] text-emerald-700">You have {j.match.shared.length} of {j.skills.length} skills ({j.match.score}%).</p>}
          </div>
        )}
        {j.description && <div className="mt-4 text-sm text-gray-700 prose-sm"><Markdown text={j.description} /></div>}
      </div>

      {!j.can_manage && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          {mine && mine.status !== "withdrawn" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><p className="text-sm font-semibold text-gray-900 flex-1">Your application</p><StageChip status={mine.status} /></div>
              <div className="flex gap-1">
                {STAGES.slice(0, 5).map(([k, l], i) => {
                  const at = STAGES.findIndex((s) => s[0] === mine.status);
                  const reached = mine.status !== "declined" && i <= at;
                  return <div key={k} className="flex-1"><div className={`h-1.5 rounded-full ${reached ? "bg-emerald-500" : "bg-gray-100"}`} /><p className={`text-[10px] mt-1 ${reached ? "text-gray-700" : "text-gray-400"}`}>{l}</p></div>;
                })}
              </div>
              <p className="text-xs text-gray-400">Applied {fmt(mine.created_at)}. Only the hiring side can see this.</p>
              {["applied", "reviewing", "interview", "offer"].includes(mine.status) && (
                <button onClick={() => window.confirm("Withdraw your application?") && act(() => apiRequest(`/companies/${companyId}/jobs/${j.id}/withdraw`, "POST"))}
                  className="text-xs text-gray-500 underline hover:text-gray-900">Withdraw</button>
              )}
            </div>
          ) : j.can_apply ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => apiRequest(`/companies/${companyId}/jobs/${j.id}/apply`, "POST", { note, tell_manager: tell })); }}>
              <p className="text-sm font-semibold text-gray-900">Apply</p>
              <textarea rows={4} className={`${inputCls} w-full`} placeholder="Why you'd be good at this, what you've worked on (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Application note" />
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Let my manager know I applied</label>
              <p className="text-xs text-gray-400">Your application is confidential: only the hiring manager, whoever posted the role and company admins see it.</p>
              <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">{mine ? "Apply again" : "Apply"}</button>
            </form>
          ) : <p className="text-sm text-gray-500">{j.status === "open" ? "Your role can't apply." : "This role isn't open."}</p>}
        </div>
      )}

      {j.can_manage && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">Applicants ({(j.applications || []).filter((a) => a.status !== "withdrawn").length})</p>
          {(j.applications || []).length === 0 && <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">No applications yet. People whose skills match were told about the role.</div>}
          {STAGES.map(([k, l]) => byStage(k).length > 0 && (
            <div key={k} className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{l} · {byStage(k).length}</p>
              <div className="grid md:grid-cols-2 gap-3">{byStage(k).map((a) => <Applicant key={a.id} a={a} companyId={companyId} onChange={load} />)}</div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function Jobs() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const companyId = getWorkspace();
  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (pathname === "/jobs/new") return <JobForm companyId={companyId} />;
  if (id && pathname.endsWith("/edit")) return <JobForm companyId={companyId} id={id} />;
  if (id) return <JobPage companyId={companyId} id={id} />;
  return <Board companyId={companyId} />;
}
