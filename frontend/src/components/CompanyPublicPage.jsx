import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Globe, Lock } from "lucide-react";
import { apiRequest } from "../utils/api";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";

// The company's public page: off by default; admins turn it on and fill it in.
// Public roles from the job board show on it, and anyone with a profile can apply.
export default function CompanyPublicPage({ company }) {
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const opts = { company: company.id };
  useEffect(() => {
    apiRequest(`/companies/${company.id}/public-page`, "GET", null, opts).then(setP).catch((err) => setError(err.message));
  }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <p className="text-sm text-gray-400">{error || "Loading…"}</p>;

  const save = async (patch) => {
    setError("");
    setMsg("");
    try {
      const r = await apiRequest(`/companies/${company.id}/public-page`, "PUT", patch, opts);
      setP(r);
      setMsg("Saved.");
    } catch (err) {
      setError(err.message);
    }
  };
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${p.is_public ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
        {p.is_public ? <Globe size={20} className="text-emerald-700" /> : <Lock size={20} className="text-gray-400" />}
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{p.is_public ? "Your public page is on" : "Your public page is off"}</p>
          <p className="text-xs text-gray-600">{p.is_public ? "Anyone can see it and your public roles. Your people, teams and work stay private." : "Turn it on to be found in Discover and to post roles publicly."}</p>
        </div>
        {p.is_public && <Link to={`/c/${p.slug}`} className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-md bg-white"><ExternalLink size={12} /> View</Link>}
        {p.can_edit && (
          <button onClick={() => save({ is_public: !p.is_public })} className={`px-3 py-1.5 text-sm rounded-md ${p.is_public ? "border border-gray-300 bg-white" : "bg-gray-900 text-white"}`}>
            {p.is_public ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      <form className="bg-white border border-gray-200 rounded-xl p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); save({ tagline: p.tagline, about: p.about, website: p.website, location: p.location }); }}>
        <label className="block text-xs text-gray-500">Tagline
          <input disabled={!p.can_edit} className={`${inputCls} w-full mt-1`} maxLength={140} placeholder="One line about what you do" value={p.tagline || ""} onChange={set("tagline")} aria-label="Tagline" />
        </label>
        <label className="block text-xs text-gray-500">About (Markdown works)
          <textarea disabled={!p.can_edit} rows={6} className={`${inputCls} w-full mt-1`} placeholder="Who you are, how you work, what it's like to work with you" value={p.about || ""} onChange={set("about")} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-xs text-gray-500">Website
            <input disabled={!p.can_edit} className={`${inputCls} w-full mt-1`} placeholder="https://…" value={p.website || ""} onChange={set("website")} />
          </label>
          <label className="block text-xs text-gray-500">Location
            <input disabled={!p.can_edit} className={`${inputCls} w-full mt-1`} placeholder="City or Remote" value={p.location || ""} onChange={set("location")} />
          </label>
        </div>
        {p.can_edit && <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md">Save</button>}
        {msg && <span className="text-sm text-emerald-700 ml-3">{msg}</span>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      <p className="text-xs text-gray-400">Head count shows as a range (like "11–50"). To post a role publicly, tick "Show on our public page" when posting it on the Job board.</p>
    </div>
  );
}
