import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Building2, ExternalLink, Link2, MapPin, Pencil, Sparkles, UserPlus } from "lucide-react";
import PublicShell from "../components/PublicShell";
import { publicGet, GENRE_LABELS, KIND_LABELS } from "../utils/publicApi";
import { apiRequest } from "../utils/api";
import { isLoggedIn } from "../api/api";

// Invite this person into one of your companies (their email stays hidden from you)
function InviteBox({ actions }) {
  const [companyId, setCompanyId] = useState(actions.invite_to[0]?.id || "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  if (!actions.invite_to.length) return null;
  const send = async () => {
    setError("");
    try {
      await apiRequest(`/companies/${companyId}/invites`, "POST", { user_id: actions.user_id, role: "member" }, { company: companyId });
      setMsg("Invite sent — they'll get it by email and in Taskflow.");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
      <UserPlus size={16} className="text-gray-400" />
      <span className="text-sm text-gray-700">Invite to</span>
      <select className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md bg-white text-gray-900" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company to invite to">
        {actions.invite_to.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button onClick={send} disabled={!!msg} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50">Send invite</button>
      {msg && <span className="text-sm text-emerald-700">{msg}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

// A person's public profile: /u/:handle — anyone can open it, only if they made it public
export default function PublicProfile() {
  const { handle } = useParams();
  const [p, setP] = useState(null);
  const [actions, setActions] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setP(null);
    publicGet(`/people/${handle}`).then(setP).catch((err) => setError(err.message));
    if (isLoggedIn()) apiRequest(`/profiles/view/${handle}/actions`, "GET", null, { personal: true }).then(setActions).catch(() => {});
  }, [handle]);

  if (error) return <PublicShell><div className="text-center py-20"><p className="text-lg font-semibold text-gray-900">Profile not found</p><p className="text-sm text-gray-500 mt-1">It may be private or the link is wrong.</p></div></PublicShell>;
  if (!p) return <PublicShell><p className="text-sm text-gray-400">Loading…</p></PublicShell>;

  return (
    <PublicShell>
      <div className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gray-900 text-white flex items-center justify-center text-3xl font-semibold shrink-0">{p.name[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-gray-900">{p.name}</h1>
                {p.open_to_work && <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700"><Sparkles size={12} /> Open to work</span>}
              </div>
              {p.headline && <p className="text-base text-gray-700 mt-1">{p.headline}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                {p.location && <span className="flex items-center gap-1"><MapPin size={14} /> {p.location}</span>}
                <span>@{p.handle}</span>
                {p.member_since && <span>on Taskflow since {p.member_since}</span>}
              </div>
              {p.open_to_work && p.open_to.length > 0 && <p className="text-sm text-gray-600 mt-2">Open to: {p.open_to.map((k) => KIND_LABELS[k]).join(", ")}</p>}
            </div>
            {actions?.is_me && <Link to="/profile/public" className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm rounded-md hover:bg-gray-50 self-start"><Pencil size={13} /> Edit</Link>}
          </div>
          {p.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {p.genres.map((g) => <span key={g} className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-900 text-white">{GENRE_LABELS[g] || g}</span>)}
            </div>
          )}
          {p.bio && <p className="text-sm text-gray-700 leading-relaxed mt-5 whitespace-pre-wrap">{p.bio}</p>}
        </div>

        {actions && !actions.is_me && <InviteBox actions={actions} />}

        <div className="grid sm:grid-cols-3 gap-5">
          <div className="sm:col-span-2 space-y-5">
            {p.showcase.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Showcase</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {p.showcase.map((s, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                      {s.description && <p className="text-sm text-gray-600 mt-1">{s.description}</p>}
                      {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mt-2"><ExternalLink size={12} /> View</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {p.skills.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Skills</h2>
                <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">{s}</span>)}</div>
              </div>
            )}
          </div>
          <div className="space-y-5">
            {p.links.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Links</h2>
                {p.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 truncate"><Link2 size={13} className="shrink-0 text-gray-400" /> {l.label}</a>
                ))}
              </div>
            )}
            {p.companies.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Works at</h2>
                {p.companies.map((c) => (
                  <Link key={c.slug} to={`/c/${c.slug}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"><Building2 size={13} className="text-gray-400" /> {c.name}{c.job_title && <span className="text-gray-400">· {c.job_title}</span>}</Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
