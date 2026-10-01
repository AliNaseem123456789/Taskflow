import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Megaphone, Pin, Trash2, Users } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useWorkspace } from "../utils/workspace";
import { useLiveEvent } from "../utils/live";
import AreaTile from "../components/AreaTile";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const who = (u) => u?.name || u?.email;

// Who has read one announcement (author / admin)
function Receipts({ companyId, id }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiRequest(`/companies/${companyId}/announcements/${id}/reads`).then(setData).catch(() => setData({ read: [], unread: [] }));
  }, [companyId, id]);
  if (!data) return <p className="text-xs text-gray-400 mt-2">Loading…</p>;
  return (
    <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
      <div>
        <p className="font-medium text-gray-700 mb-1">Read ({data.read.length})</p>
        <p className="text-gray-500">{data.read.map(who).join(", ") || "—"}</p>
      </div>
      <div>
        <p className="font-medium text-gray-700 mb-1">Not yet ({data.unread.length})</p>
        <p className="text-gray-500">{data.unread.map(who).join(", ") || "Everyone has read it"}</p>
      </div>
    </div>
  );
}

// Company announcements: post to everyone, a team or a department; see who read them
export default function Announcements() {
  const companyId = getWorkspace();
  const { current } = useWorkspace();
  const [list, setList] = useState(null);
  const [org, setOrg] = useState({ teams: [], departments: [] });
  const [form, setForm] = useState({ title: "", body: "", audience: "company", team_id: "", department_id: "", pinned: false });
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () => companyId && apiRequest(`/companies/${companyId}/announcements`).then(setList).catch((err) => setError(err.message)),
    [companyId]
  );
  useEffect(() => {
    load();
    if (companyId) apiRequest(`/companies/${companyId}/org`).then(setOrg).catch(() => {});
  }, [companyId, load]);
  useLiveEvent("notification", load);

  if (!companyId) return <Navigate to="/dashboard" replace />;
  const isAdmin = ["owner", "admin"].includes(current?.role);

  const post = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await apiRequest(`/companies/${companyId}/announcements`, "POST", {
        ...form, team_id: form.team_id || null, department_id: form.department_id || null,
      });
      setForm({ title: "", body: "", audience: "company", team_id: "", department_id: "", pinned: false });
      setComposing(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const act = (fn) => fn().then(load).catch((err) => setError(err.message));

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title"><AreaTile />Announcements</h1>
          <p className="text-sm text-gray-500 mt-1">News for {current?.name || "the company"}.</p>
        </div>
        {current?.role !== "guest" && current?.role !== "viewer" && !composing && (
          <button onClick={() => setComposing(true)} className="flex items-center gap-1.5 px-3 py-2 btn-accent text-sm rounded-md">
            <Megaphone size={14} /> New announcement
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {composing && (
        <form onSubmit={post} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-5">
          <input required autoFocus className={`${inputCls} w-full`} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea rows={4} className={`${inputCls} w-full`} placeholder="What do people need to know?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="flex flex-wrap gap-2 items-center">
            <select className={inputCls} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="company">Everyone in the company</option>
              <option value="team">One team</option>
              <option value="department">One department</option>
            </select>
            {form.audience === "team" && (
              <select required className={inputCls} value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                <option value="">Pick a team</option>
                {org.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {form.audience === "department" && (
              <select required className={inputCls} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Pick a department</option>
                {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to top
              </label>
            )}
          </div>
          <p className="text-xs text-gray-400">Admins post to anyone; managers to their department; team leads to their team.</p>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 btn-accent text-sm rounded-md">Post</button>
            <button type="button" onClick={() => setComposing(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
          </div>
        </form>
      )}

      {list === null && <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />}
      {list?.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-gray-400">
          <Megaphone size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No announcements yet.</p>
        </div>
      )}
      <div className="space-y-3">
        {list?.map((a) => (
          <article key={a.id} className={`bg-white border rounded-lg p-4 ${a.read ? "border-gray-200" : "border-indigo-600"}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-[17px] font-bold text-gray-900 flex items-center gap-1.5">
                  {a.pinned && <Pin size={12} className="text-gray-500" />}
                  {a.title}
                  {!a.read && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded btn-accent ">new</span>}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {who(a.author) || "Someone"} · {new Date(a.created_at).toLocaleString()} ·{" "}
                  {a.audience === "company" ? "everyone" : a.audience === "team" ? `team ${a.team_name}` : `${a.department_name} department`}
                </p>
              </div>
              {!a.read && (
                <button className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-md hover:bg-gray-50"
                  onClick={() => act(() => apiRequest(`/companies/${companyId}/announcements/${a.id}/read`, "POST"))}>
                  <Check size={12} /> Got it
                </button>
              )}
              {a.can_manage && (
                <button className="p-1 text-gray-300 hover:text-rose-500" title="Delete"
                  onClick={() => window.confirm("Delete this announcement?") && act(() => apiRequest(`/companies/${companyId}/announcements/${a.id}`, "DELETE"))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {a.body && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{a.body}</p>}
            {a.can_manage && (
              <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mt-3">
                <Users size={12} /> Read by {a.read_count}
              </button>
            )}
            {open === a.id && <Receipts companyId={companyId} id={a.id} />}
          </article>
        ))}
      </div>
    </div>
  );
}
