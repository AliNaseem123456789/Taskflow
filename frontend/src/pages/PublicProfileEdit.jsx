import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Globe, Lock, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { GENRE_LABELS, KIND_LABELS } from "../utils/publicApi";
import AreaTile from "../components/AreaTile";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const opts = { personal: true }; // a profile belongs to the person, not a workspace

// Edit your public profile (opt-in). Personal tasks never appear on it.
export default function PublicProfileEdit() {
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest("/profiles/me", "GET", null, opts).then((d) => {
      setData(d);
      const p = d.profile || {};
      setF({
        handle: p.handle || d.suggested_handle, is_public: !!p.is_public, headline: p.headline || "", bio: p.bio || "", location: p.location || "",
        genres: p.genres || [], skills: (p.skills || []).join(", "), links: p.links?.length ? p.links : [{ label: "", url: "" }],
        showcase: p.showcase || [], open_to_work: !!p.open_to_work, open_to: p.open_to || [], show_companies: !!p.show_companies,
      });
    }).catch((err) => setError(err.message));
  }, []);

  if (!f) return <div className="p-8 text-sm text-gray-400">{error || "Loading…"}</div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleIn = (k, v, max) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : f[k].length >= max ? f[k] : [...f[k], v] });

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const p = await apiRequest("/profiles/me", "PUT", {
        ...f, skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
        links: f.links.filter((l) => l.url.trim()), showcase: f.showcase.filter((s) => s.title.trim()),
      }, opts);
      setData({ ...data, profile: p });
      setMsg(p.is_public ? "Saved — your profile is public." : "Saved. Your profile is private until you turn it on.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saved = data.profile;
  return (
    <form onSubmit={save} className="p-6 lg:p-8 max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title"><AreaTile /> Public profile</h1>
          <p className="text-sm text-gray-500 mt-1">A page about your work that people can find in Discover. Your personal tasks and email never appear on it.</p>
        </div>
        {saved?.is_public && <Link to={`/u/${saved.handle}`} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm rounded-md hover:bg-gray-50 shrink-0"><ExternalLink size={13} /> View</Link>}
      </div>

      <div className={`rounded-xl border p-4 flex items-center gap-3 ${f.is_public ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
        {f.is_public ? <Globe size={20} className="text-emerald-700" /> : <Lock size={20} className="text-gray-400" />}
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{f.is_public ? "Public" : "Private"}</p>
          <p className="text-xs text-gray-600">{f.is_public ? "Anyone with the link can see it, and logged-in people can find it in Discover." : "Only you can see this. Turn it on when you're ready."}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <input type="checkbox" className="w-4 h-4" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} aria-label="Make my profile public" /> Public
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <label className="block text-xs text-gray-500">Your link
          <div className="flex items-center mt-1">
            <span className="text-sm text-gray-400 px-3 py-2 bg-gray-50 border border-r-0 border-gray-200 rounded-l-md">{window.location.host}/u/</span>
            <input className={`${inputCls} rounded-l-none flex-1`} value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value.toLowerCase() })} aria-label="Link name" />
          </div>
        </label>
        <label className="block text-xs text-gray-500">Headline
          <input className={`${inputCls} w-full mt-1`} maxLength={120} placeholder="e.g. Product designer who loves calm software" value={f.headline} onChange={set("headline")} aria-label="Headline" />
        </label>
        <label className="block text-xs text-gray-500">Location
          <input className={`${inputCls} w-full mt-1`} maxLength={80} placeholder="City, country or Remote" value={f.location} onChange={set("location")} aria-label="Location" />
        </label>
        <label className="block text-xs text-gray-500">About you
          <textarea rows={4} maxLength={2000} className={`${inputCls} w-full mt-1`} placeholder="What you do, what you're good at, what you're looking for" value={f.bio} onChange={set("bio")} />
        </label>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Kinds of work (up to 5)</p>
          <div className="flex flex-wrap gap-1.5">
            {data.genres.map((g) => (
              <button type="button" key={g} onClick={() => toggleIn("genres", g, 5)}
                className={`text-xs px-2.5 py-1 rounded-full border ${f.genres.includes(g) ? "btn-accent border-indigo-600" : "border-gray-200 text-gray-700 hover:border-gray-400"}`}>{GENRE_LABELS[g] || g}</button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-gray-500">Skills (comma separated)
          <input className={`${inputCls} w-full mt-1`} placeholder="figma, user research, prototyping" value={f.skills} onChange={set("skills")} aria-label="Profile skills" />
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <input type="checkbox" className="w-4 h-4" checked={f.open_to_work} onChange={(e) => setF({ ...f, open_to_work: e.target.checked })} /> Show that I'm open to work
        </label>
        {f.open_to_work && (
          <div className="flex flex-wrap gap-1.5 pl-6">
            {Object.entries(KIND_LABELS).map(([k, l]) => (
              <button type="button" key={k} onClick={() => toggleIn("open_to", k, 4)}
                className={`text-xs px-2.5 py-1 rounded-full border ${f.open_to.includes(k) ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-700"}`}>{l}</button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="w-4 h-4" checked={f.show_companies} onChange={(e) => setF({ ...f, show_companies: e.target.checked })} /> Show the companies I work at (only ones with a public page)
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <p className="text-sm font-semibold text-gray-900">Links</p>
        {f.links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input className={`${inputCls} w-36`} placeholder="Label" value={l.label} onChange={(e) => setF({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input className={`${inputCls} flex-1`} placeholder="https://…" value={l.url} onChange={(e) => setF({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} aria-label={`Link ${i + 1}`} />
            <button type="button" onClick={() => setF({ ...f, links: f.links.filter((_, j) => j !== i) })} className="p-2 text-gray-300 hover:text-rose-500" aria-label="Remove link"><Trash2 size={14} /></button>
          </div>
        ))}
        {f.links.length < 6 && <button type="button" onClick={() => setF({ ...f, links: [...f.links, { label: "", url: "" }] })} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"><Plus size={12} /> Add link</button>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Showcase</p>
          <p className="text-xs text-gray-500">Work you're proud of — you write these; nothing is pulled from your tasks.</p>
        </div>
        {f.showcase.map((s, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} placeholder="Title" value={s.title} onChange={(e) => setF({ ...f, showcase: f.showcase.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} aria-label={`Showcase title ${i + 1}`} />
              <button type="button" onClick={() => setF({ ...f, showcase: f.showcase.filter((_, j) => j !== i) })} className="p-2 text-gray-300 hover:text-rose-500" aria-label="Remove item"><Trash2 size={14} /></button>
            </div>
            <input className={`${inputCls} w-full`} placeholder="One or two lines about it" value={s.description || ""} onChange={(e) => setF({ ...f, showcase: f.showcase.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
            <input className={`${inputCls} w-full`} placeholder="Link (optional)" value={s.url || ""} onChange={(e) => setF({ ...f, showcase: f.showcase.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
          </div>
        ))}
        {f.showcase.length < 12 && <button type="button" onClick={() => setF({ ...f, showcase: [...f.showcase, { title: "", description: "", url: "" }] })} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"><Plus size={12} /> Add showcase item</button>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      <button disabled={busy} className="px-5 py-2 btn-accent text-sm rounded-md disabled:opacity-50">{busy ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
