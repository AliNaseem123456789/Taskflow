import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { BookOpen, ChevronRight, FileText, History, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useCompanyPeople } from "../utils/companyPeople";
import Markdown from "../components/Markdown";
import { aiRequest, useAI } from "../utils/ai";
import { Sparkles } from "lucide-react";
import AreaTile from "../components/AreaTile";

// "Ask the wiki": an answer from the pages you can see, with links to them
function AskWiki({ onOpen }) {
  const ai = useAI();
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!ai.on) return null;
  const ask = async (e) => {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      setRes(await aiRequest("/api/wiki/ask", { question: q }));
    } catch (err) {
      setRes({ answer: err.message, sources: [], found: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-5">
      <form onSubmit={ask} className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Ask the wiki, e.g. How do refunds work?" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button disabled={busy} className="px-3 py-2 btn-accent text-sm rounded-md disabled:opacity-50">{busy ? "Looking…" : "Ask"}</button>
      </form>
      {res && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl p-4">
          <Markdown text={res.answer} />
          {res.sources.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">From: {res.sources.map((s, i) => (
              <span key={s.id}>{i > 0 && ", "}<button className="underline" onClick={() => onOpen(s.id)}>{s.title}</button></span>
            ))}</p>
          )}
          {!res.found && <p className="text-xs text-gray-400 mt-1">Nothing in the wiki answers this yet — maybe write a page?</p>}
        </div>
      )}
    </div>
  );
}

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const who = (u) => u?.name || u?.email;

// Left-hand tree: company pages, then each team's pages
function Tree({ pages, current, onOpen }) {
  const spaces = [{ key: "", name: "Company" }, ...[...new Map(pages.filter((p) => p.team_id).map((p) => [p.team_id, p.team_name])).entries()].map(([key, name]) => ({ key, name }))];
  const ids = new Set(pages.map((p) => p.id));
  const children = (parentId, space) =>
    pages.filter((p) => (p.team_id || "") === space && (parentId ? p.parent_id === parentId : !p.parent_id || !ids.has(p.parent_id)));
  const Node = ({ page, depth }) => (
    <>
      <button onClick={() => onOpen(page.id)} style={{ paddingLeft: 8 + depth * 14 }}
        className={`w-full flex items-center gap-1.5 pr-2 py-1 rounded text-left text-sm truncate ${current === page.id ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
        <FileText size={12} className="shrink-0 text-gray-400" /> <span className="truncate">{page.title}</span>
      </button>
      {children(page.id, page.team_id || "").map((c) => <Node key={c.id} page={c} depth={depth + 1} />)}
    </>
  );
  return (
    <div className="space-y-3">
      {spaces.map((s) => {
        const roots = children(null, s.key);
        if (!roots.length && s.key) return null;
        return (
          <div key={s.key || "company"}>
            <p className="px-2 text-[11px] font-medium text-gray-400 mb-1">{s.name}</p>
            {roots.length ? roots.map((p) => <Node key={p.id} page={p} depth={0} />) : <p className="px-2 text-xs text-gray-400">No pages yet</p>}
          </div>
        );
      })}
    </div>
  );
}

function Editor({ initial, teams, pages, isNew, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [preview, setPreview] = useState(false);
  const parents = pages.filter((p) => (p.team_id || "") === (form.team_id || "") && p.id !== initial.id);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-3">
      <input required autoFocus className={`${inputCls} w-full text-lg font-semibold`} placeholder="Page title" value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        {isNew && (
          <select className={inputCls} value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value, parent_id: "" })}>
            <option value="">Company space (everyone)</option>
            {teams.map((t) => <option key={t.id} value={t.id}>Team space: {t.name}</option>)}
          </select>
        )}
        <select className={inputCls} value={form.parent_id || ""} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
          <option value="">Top-level page</option>
          {parents.map((p) => <option key={p.id} value={p.id}>Inside {p.title}</option>)}
        </select>
        <div className="flex gap-1 ml-auto">
          {[[false, "Write"], [true, "Preview"]].map(([v, label]) => (
            <button key={label} type="button" onClick={() => setPreview(v)}
              className={`px-3 py-1 text-xs rounded-md ${preview === v ? "btn-accent " : "bg-gray-100 text-gray-600"}`}>{label}</button>
          ))}
        </div>
      </div>
      {preview ? (
        <div className="min-h-[300px] border border-gray-200 rounded-md p-4 bg-white"><Markdown text={form.body} /></div>
      ) : (
        <textarea rows={18} className={`${inputCls} w-full font-mono text-[13px]`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder={"# Heading\n\nWrite in plain text. **bold**, *italic*, `code`, [link](https://…)\n\n- lists\n- [ ] checkboxes"} />
      )}
      <div className="flex gap-2">
        <button className="px-3 py-1.5 btn-accent text-sm rounded-md">Save page</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
      </div>
    </form>
  );
}

// Company / team wiki with page history
export default function Wiki() {
  const { id } = useParams();
  const navigate = useNavigate();
  const companyId = getWorkspace();
  const { teams } = useCompanyPeople();
  const [pages, setPages] = useState(null);
  const [page, setPage] = useState(null);
  const [mode, setMode] = useState("read"); // read | edit | new | history
  const [version, setVersion] = useState(null);
  const [error, setError] = useState("");

  const loadPages = useCallback(() => companyId && apiRequest("/wiki").then(setPages).catch(() => setPages([])), [companyId]);
  useEffect(() => { loadPages(); }, [loadPages]);
  useEffect(() => {
    setVersion(null);
    setError("");
    if (!id) return setPage(null);
    setMode("read");
    apiRequest(`/wiki/${id}`).then(setPage).catch((err) => { setPage(null); setError(err.message); });
  }, [id]);

  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (!pages) return <div className="p-8"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>;

  const open = (pid) => navigate(`/wiki/${pid}`);
  const save = async (form) => {
    setError("");
    try {
      if (mode === "new") {
        const p = await apiRequest("/wiki", "POST", { ...form, team_id: form.team_id || null, parent_id: form.parent_id || null });
        await loadPages();
        open(p.id);
      } else {
        await apiRequest(`/wiki/${page.id}`, "PUT", { title: form.title, body: form.body, parent_id: form.parent_id || null, base_updated_at: page.updated_at });
        setPage(await apiRequest(`/wiki/${page.id}`));
        setMode("read");
        loadPages();
      }
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${page.title}"? Pages inside it move up a level.`)) return;
    try {
      await apiRequest(`/wiki/${page.id}`, "DELETE");
      await loadPages();
      navigate("/wiki");
    } catch (err) {
      setError(err.message);
    }
  };
  const showVersion = (v) => apiRequest(`/wiki/${page.id}/versions/${v.id}`).then(setVersion).catch((err) => setError(err.message));

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="page-title"><AreaTile />Wiki</h1>
          <p className="text-sm text-gray-500 mt-1">How things work here: handbooks, runbooks, team notes.</p>
        </div>
        {mode !== "new" && (
          <button onClick={() => setMode("new")} className="flex items-center gap-1.5 px-3 py-2 btn-accent text-sm rounded-md">
            <Plus size={14} /> New page
          </button>
        )}
      </div>

      <AskWiki onOpen={(pid) => navigate(`/wiki/${pid}`)} />

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="md:w-60 shrink-0 bg-white border border-gray-200 rounded-xl p-2 self-start">
          <Tree pages={pages} current={page?.id} onOpen={open} />
        </aside>

        <main className="flex-1 min-w-0">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {mode === "new" ? (
            <Editor isNew initial={{ title: "", body: "", team_id: "", parent_id: page && !page.team_id ? page.id : "" }} teams={teams} pages={pages}
              onSave={save} onCancel={() => setMode("read")} />
          ) : !page ? (
            <div className="bg-white border border-gray-200 rounded-xl py-14 text-center text-gray-400">
              <BookOpen size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">{pages.length ? "Pick a page on the left." : "No pages yet. Start with a handbook or a runbook."}</p>
            </div>
          ) : mode === "edit" ? (
            <Editor initial={{ id: page.id, title: page.title, body: page.body, team_id: page.team_id || "", parent_id: page.parent_id || "" }}
              teams={teams} pages={pages} onSave={save} onCancel={() => setMode("read")} />
          ) : (
            <article className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex flex-wrap items-start gap-2 mb-1">
                <h2 className="text-2xl font-semibold text-gray-900 flex-1 min-w-[200px]">{page.title}</h2>
                {page.can_edit && (
                  <button onClick={() => setMode("edit")} className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50">
                    <Pencil size={12} /> Edit
                  </button>
                )}
                <button onClick={() => { setMode(mode === "history" ? "read" : "history"); setVersion(null); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50">
                  <History size={12} /> History ({page.versions.length})
                </button>
                {page.can_delete && (
                  <button onClick={remove} className="p-1.5 text-gray-300 hover:text-rose-500" title="Delete page"><Trash2 size={14} /></button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-5">
                Last edited by {who(page.editor) || "someone"} · {new Date(page.updated_at).toLocaleString()}
              </p>
              {mode === "history" && (
                <div className="mb-5 border border-gray-200 rounded-md divide-y divide-gray-100">
                  {page.versions.map((v, i) => (
                    <button key={v.id} onClick={() => showVersion(v)} className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 ${version?.id === v.id ? "bg-gray-50" : ""}`}>
                      <ChevronRight size={12} className="text-gray-400" />
                      <span className="text-gray-700">{new Date(v.created_at).toLocaleString()}</span>
                      <span className="text-gray-400">· {who(v.editor)}{i === 0 && " · current"}</span>
                    </button>
                  ))}
                </div>
              )}
              {version ? (
                <div>
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-3 flex items-center gap-2">
                    Showing the version from {new Date(version.created_at).toLocaleString()}.
                    {page.can_edit && (
                      <button className="underline" onClick={() => save({ title: version.title, body: version.body, parent_id: page.parent_id })}>Restore this version</button>
                    )}
                  </p>
                  <Markdown text={version.body} />
                </div>
              ) : (
                page.body ? <Markdown text={page.body} /> : <p className="text-sm text-gray-400">This page is empty.</p>
              )}
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
