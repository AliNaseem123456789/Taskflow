import { createElement, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Compass, MapPin, Search, Sparkles, UserCircle } from "lucide-react";
import { apiRequest } from "../utils/api";
import { GENRE_LABELS } from "../utils/publicApi";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const opts = { personal: true };
const STAGE = {
  applied: ["Applied", "bg-gray-100 text-gray-700"], reviewing: ["Reviewing", "bg-sky-50 text-sky-700"], interview: ["Interview", "bg-violet-50 text-violet-700"],
  offer: ["Offer", "bg-amber-50 text-amber-700"], hired: ["Hired", "bg-emerald-50 text-emerald-700"], declined: ["Declined", "bg-rose-50 text-rose-700"], withdrawn: ["Withdrawn", "bg-gray-100 text-gray-500"],
};

function People() {
  const [f, setF] = useState({ q: "", genre: "", skill: "", location: "", open_to_work: false });
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, v === true ? "1" : v]));
      apiRequest(`/profiles/search?${p}`, "GET", null, opts).then(setRes).catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [f]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Name, headline or skill" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search people" />
        </div>
        <input className={`${inputCls} w-36`} placeholder="Skill" value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value })} />
        <input className={`${inputCls} w-36`} placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <label className="flex items-center gap-1.5 text-sm text-gray-700 px-2"><input type="checkbox" checked={f.open_to_work} onChange={(e) => setF({ ...f, open_to_work: e.target.checked })} /> Open to work</label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["", ...Object.keys(GENRE_LABELS)].map((g) => (
          <button key={g || "all"} onClick={() => setF({ ...f, genre: g })}
            className={`text-xs px-2.5 py-1 rounded-full border ${f.genre === g ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>{g ? GENRE_LABELS[g] : "All kinds of work"}</button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {res?.people.length === 0 && <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-400">Nobody matches yet.</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {res?.people.map((p) => (
          <Link key={p.handle} to={`/u/${p.handle}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-semibold shrink-0">{p.name[0].toUpperCase()}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500 truncate">{p.headline || `@${p.handle}`}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
              {p.open_to_work && <span className="flex items-center gap-1 text-emerald-700 font-medium"><Sparkles size={11} /> Open to work</span>}
              {p.location && <span className="flex items-center gap-1"><MapPin size={11} /> {p.location}</span>}
              {p.genres.slice(0, 2).map((g) => <span key={g}>{GENRE_LABELS[g] || g}</span>)}
            </div>
            {p.skills.length > 0 && <div className="flex flex-wrap gap-1">{p.skills.slice(0, 5).map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>)}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Companies() {
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [res, setRes] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(Object.entries({ q, genre }).filter(([, v]) => v));
      apiRequest(`/profiles/companies?${p}`, "GET", null, opts).then(setRes).catch(() => setRes({ companies: [], work_types: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [q, genre]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Company name or what they do" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
        </div>
        <select className={inputCls} value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Kind of work">
          <option value="">All kinds of work</option>
          {res?.work_types.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
        </select>
      </div>
      {res?.companies.length === 0 && <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-400">No public company pages match.</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        {res?.companies.map((c) => (
          <Link key={c.slug} to={`/c/${c.slug}`} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 flex gap-3">
            <div className="w-11 h-11 rounded-xl bg-gray-900 text-white flex items-center justify-center font-semibold shrink-0">{c.name[0].toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{c.name}</p>
              {c.tagline && <p className="text-xs text-gray-600 line-clamp-2">{c.tagline}</p>}
              <div className="flex flex-wrap gap-x-3 text-[11px] text-gray-500 mt-1">
                <span>{c.work_type_label}</span>
                {c.location && <span className="flex items-center gap-1"><MapPin size={11} /> {c.location}</span>}
                {c.open_roles > 0 && <span className="text-emerald-700 font-medium">{c.open_roles} open role{c.open_roles === 1 ? "" : "s"}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Applications() {
  const [rows, setRows] = useState(null);
  const load = () => apiRequest("/profiles/applications", "GET", null, opts).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
      {rows?.length === 0 && <p className="p-8 text-center text-sm text-gray-400">You haven't applied to any roles.</p>}
      {rows?.map((a) => {
        const [label, cls] = STAGE[a.status];
        const link = a.external ? (a.posting.company?.is_public ? `/c/${a.posting.company.slug}` : null) : `/jobs/${a.posting.id}`;
        return (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              {link ? <Link to={link} className="text-sm text-gray-900 hover:underline">{a.posting.title}</Link> : <span className="text-sm text-gray-900">{a.posting.title}</span>}
              <p className="text-xs text-gray-400">{a.posting.company?.name} · {a.external ? "from outside" : "inside the company"} · {new Date(a.created_at).toLocaleDateString()}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
            {a.external && ["applied", "reviewing", "interview", "offer"].includes(a.status) && (
              <button onClick={() => window.confirm("Withdraw this application?") && apiRequest(`/profiles/applications/${a.id}/withdraw`, "POST", null, opts).then(load)} className="text-xs text-gray-400 hover:text-gray-900">Withdraw</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Discover: people with public profiles, companies with public pages, and roles you applied to
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "people";
  const tabs = [["people", "People", UserCircle], ["companies", "Companies", Building2], ["applications", "My applications", Sparkles]];
  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><Compass size={20} /> Discover</h1>
          <p className="text-sm text-gray-500 mt-1">Find people and companies by the kind of work they do. Only profiles and pages their owners made public show here.</p>
        </div>
        <Link to="/profile/public" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-sm rounded-md hover:bg-gray-50 shrink-0"><UserCircle size={14} /> My public profile</Link>
      </div>
      <div className="flex gap-6 border-b border-gray-200">
        {tabs.map(([k, l, icon]) => (
          <button key={k} onClick={() => setParams({ tab: k })} className={`flex items-center gap-1.5 pb-2 text-sm -mb-px border-b-2 ${tab === k ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
            {createElement(icon, { size: 14 })} {l}
          </button>
        ))}
      </div>
      {tab === "people" && <People />}
      {tab === "companies" && <Companies />}
      {tab === "applications" && <Applications />}
    </div>
  );
}
