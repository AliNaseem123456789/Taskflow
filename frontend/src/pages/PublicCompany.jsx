import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, Globe, MapPin, Users } from "lucide-react";
import PublicShell from "../components/PublicShell";
import Markdown from "../components/Markdown";
import { publicGet } from "../utils/publicApi";
import { apiRequest } from "../utils/api";
import { isLoggedIn } from "../api/api";

const KIND = { full_time: "Full-time", part_time: "Part-time", project: "Project", gig: "Short gig" };
const fmt = (d) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");

// Apply to a public role: needs a login and a public profile (that's what the hiring team sees)
function ApplyBox({ job }) {
  const location = useLocation();
  const [me, setMe] = useState(undefined);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isLoggedIn()) apiRequest("/profiles/me", "GET", null, { personal: true }).then(setMe).catch(() => setMe(null));
    else setMe(null);
  }, []);

  if (!isLoggedIn())
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-700 flex flex-wrap items-center gap-3">
        <span className="flex-1">Log in or create a free account to apply. Your public profile is what the hiring team sees.</span>
        <Link to="/login" state={{ from: location.pathname }} className="px-4 py-2 bg-gray-900 text-white rounded-md">Log in to apply</Link>
      </div>
    );
  if (me === undefined) return null;
  if (done)
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-3 text-sm">
        <CheckCircle2 className="text-emerald-600" size={22} />
        <span className="flex-1 text-gray-800">Application sent. Follow it in <Link to="/discover?tab=applications" className="underline">Discover → My applications</Link>.</span>
      </div>
    );
  if (!me?.profile?.is_public)
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-700 flex flex-wrap items-center gap-3">
        <span className="flex-1">Turn on your public profile to apply — the hiring team sees your headline, skills and showcase, never your email.</span>
        <Link to="/profile/public" className="px-4 py-2 bg-gray-900 text-white rounded-md">Set up my profile</Link>
      </div>
    );
  return (
    <form className="bg-white border border-gray-200 rounded-xl p-5 space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setError("");
      try {
        await apiRequest(`/profiles/jobs/${job.id}/apply`, "POST", { note }, { personal: true });
        setDone(true);
      } catch (err) {
        setError(err.message);
      }
    }}>
      <p className="text-sm font-semibold text-gray-900">Apply as {me.name || me.profile.handle}</p>
      <textarea rows={4} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400" placeholder="Why you're a good fit (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Application note" />
      <p className="text-xs text-gray-400">They'll see your public profile (<Link to={`/u/${me.profile.handle}`} className="underline">@{me.profile.handle}</Link>) and this note.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md">Send application</button>
    </form>
  );
}

function JobView({ slug, jobId }) {
  const [j, setJ] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { publicGet(`/jobs/${jobId}`).then(setJ).catch((err) => setError(err.message)); }, [jobId]);
  if (error) return <div className="text-center py-20"><p className="text-lg font-semibold text-gray-900">This role isn't open</p><Link to={`/c/${slug}`} className="text-sm underline text-gray-500">See the company's other roles</Link></div>;
  if (!j) return <p className="text-sm text-gray-400">Loading…</p>;
  return (
    <div className="space-y-5">
      <Link to={`/c/${slug}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> {j.company.name}</Link>
      <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8">
        <p className="text-sm text-gray-500">{j.company.name}</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">{j.title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
          <span>{[j.team?.name, KIND[j.kind], j.level].filter(Boolean).join(" · ")}</span>
          {j.location && <span className="flex items-center gap-1"><MapPin size={14} /> {j.location}</span>}
          {j.closes_on && <span className="flex items-center gap-1"><Clock size={14} /> closes {fmt(j.closes_on)}</span>}
        </div>
        {j.skills.length > 0 && <div className="flex flex-wrap gap-1.5 mt-4">{j.skills.map((s) => <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">{s}</span>)}</div>}
        {j.description && <div className="text-sm text-gray-700 mt-5"><Markdown text={j.description} /></div>}
      </div>
      <ApplyBox job={j} />
    </div>
  );
}

function CompanyView({ slug }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { publicGet(`/companies/${slug}`).then(setC).catch((err) => setError(err.message)); }, [slug]);
  if (error) return <div className="text-center py-20"><p className="text-lg font-semibold text-gray-900">Company not found</p><p className="text-sm text-gray-500 mt-1">Its page may be private.</p></div>;
  if (!c) return <p className="text-sm text-gray-400">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 text-white flex items-center justify-center text-2xl font-semibold shrink-0">{c.name[0].toUpperCase()}</div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900">{c.name}</h1>
            {c.tagline && <p className="text-base text-gray-700 mt-1">{c.tagline}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
              <span className="font-medium text-gray-700">{c.work_type_label}</span>
              <span className="flex items-center gap-1"><Users size={14} /> {c.size} people</span>
              {c.location && <span className="flex items-center gap-1"><MapPin size={14} /> {c.location}</span>}
              {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 hover:text-gray-900"><Globe size={14} /> {c.website.replace(/^https?:\/\//, "")}</a>}
            </div>
          </div>
        </div>
        {c.about && <div className="text-sm text-gray-700 mt-5"><Markdown text={c.about} /></div>}
      </div>
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Open roles {c.jobs.length > 0 && <span className="text-gray-400 font-normal">· {c.jobs.length}</span>}</h2>
        {c.jobs.length === 0 && <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">No open roles right now.</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          {c.jobs.map((j) => (
            <Link key={j.id} to={`/c/${c.slug}/jobs/${j.id}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400">
              <p className="text-sm font-semibold text-gray-900">{j.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{[j.team?.name, KIND[j.kind], j.level, j.location].filter(Boolean).join(" · ")}</p>
              {j.skills.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{j.skills.slice(0, 5).map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>)}</div>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// A company's public page /c/:slug and its public roles /c/:slug/jobs/:jobId
export default function PublicCompany() {
  const { slug, jobId } = useParams();
  return <PublicShell>{jobId ? <JobView slug={slug} jobId={jobId} /> : <CompanyView slug={slug} />}</PublicShell>;
}
