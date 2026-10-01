import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, ClipboardList, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useMyProjects } from "../utils/projects";
import { useCompanyPeople } from "../utils/companyPeople";
import { STATUS_BADGE } from "../utils/taskMeta";

const inputCls = "text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const Q_KINDS = [["text", "Short answer"], ["textarea", "Long answer"], ["number", "Number"], ["select", "Dropdown"], ["date", "Date"]];
const BUILT_IN = [["", "Only in the description"], ["title", "Task title"], ["description", "Task description"], ["due_date", "Due date"], ["priority", "Priority"]];
const newId = () => `q${Math.random().toString(36).slice(2, 8)}`;

// ── List ──────────────────────────────────────────────────────────────────────
function FormList({ companyId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest(`/companies/${companyId}/forms`).then(setData).catch((err) => setError(err.message));
  }, [companyId]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><ClipboardList size={20} /> Request forms</h1>
          <p className="text-sm text-gray-500 mt-1">Ask another team for something. Each request becomes a task in their project, and you can follow it from here.</p>
        </div>
        {data?.can_create && (
          <Link to="/forms/new" className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 shrink-0"><Plus size={14} /> New form</Link>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === null && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {data?.forms.length === 0 && <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-400">No forms yet.</div>}
      <div className="grid sm:grid-cols-2 gap-4">
        {data?.forms.map((f) => (
          <div key={f.id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                {!f.is_open && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">closed</span>}
              </div>
              {f.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{f.description}</p>}
              <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.project?.color }} /> goes to {f.project?.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {f.is_open && <Link to={`/forms/${f.id}`} className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-800">Fill in</Link>}
              {f.can_edit && (
                <>
                  <Link to={`/forms/${f.id}/edit`} className="px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50">Edit</Link>
                  <Link to={`/forms/${f.id}/requests`} className="px-3 py-1.5 border border-gray-200 text-xs rounded-md hover:bg-gray-50">Requests ({f.submissions})</Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {data?.my_requests.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Your requests</h2>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
            {data.my_requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {r.task ? <Link to={`/tasks/${r.task.id}`} className="flex-1 min-w-0 truncate text-gray-900 hover:underline">{r.task.title}</Link> : <span className="flex-1 text-gray-400">Task removed</span>}
                <span className="text-xs text-gray-400">{r.form.name} · {new Date(r.created_at).toLocaleDateString()}</span>
                {r.task && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.task.status]}`}>{r.task.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Builder ───────────────────────────────────────────────────────────────────
function FormBuilder({ companyId, id }) {
  const navigate = useNavigate();
  const projects = useMyProjects().filter((p) => p.company_id === companyId);
  const { members } = useCompanyPeople();
  const [form, setForm] = useState(id ? null : {
    name: "", description: "", project_id: "", assignee_id: "", default_priority: "medium", is_open: true,
    questions: [
      { id: newId(), label: "What do you need?", kind: "text", required: true, maps_to: "title", options: [] },
      { id: newId(), label: "Details", kind: "textarea", required: false, maps_to: "description", options: [] },
    ],
  });
  const [fields, setFields] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiRequest(`/companies/${companyId}/forms/${id}`).then((f) => {
      if (!f.can_edit) return navigate(`/forms/${id}`, { replace: true });
      setForm({ ...f, assignee_id: f.assignee_id || "", questions: f.questions.map((q) => ({ ...q, options: q.options || [] })) });
      setFields(f.fields || []);
    }).catch((err) => setError(err.message));
  }, [companyId, id, navigate]);

  // the target project's custom fields, so questions can fill them
  const project = projects.find((p) => p.id === form?.project_id);
  useEffect(() => {
    if (!project) return;
    apiRequest(`/teams/${project.team_id}/projects/${project.id}/fields`).then((d) => setFields(d.fields)).catch(() => setFields([]));
  }, [project?.id, project?.team_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return <div className="p-8 text-sm text-gray-400">{error || "Loading…"}</div>;
  const setQ = (i, patch) => setForm({ ...form, questions: form.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const move = (i, d) => {
    const qs = [...form.questions];
    [qs[i], qs[i + d]] = [qs[i + d], qs[i]];
    setForm({ ...form, questions: qs });
  };
  const fieldKindFor = (maps) => {
    if (maps === "due_date") return "date";
    if (maps === "priority") return "select";
    const f = maps?.startsWith("field:") && fields.find((x) => `field:${x.id}` === maps);
    if (!f) return null;
    return { text: "text", number: "number", select: "select", date: "date" }[f.kind] || null;
  };
  const mapTo = (i, maps) => {
    const patch = { maps_to: maps };
    const kind = fieldKindFor(maps);
    if (kind) patch.kind = kind;
    if (maps === "priority") patch.options = ["low", "medium", "high", "urgent"];
    const f = maps.startsWith("field:") && fields.find((x) => `field:${x.id}` === maps);
    if (f?.kind === "select") patch.options = f.options;
    if (maps === "title") patch.required = true;
    setQ(i, patch);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      name: form.name, description: form.description, project_id: form.project_id, assignee_id: form.assignee_id || null,
      default_priority: form.default_priority, is_open: form.is_open,
      questions: form.questions.map(({ id: qid, label, kind, required, options, maps_to, help }) => ({ id: qid, label, kind, required, options, maps_to, help })),
    };
    try {
      if (id) await apiRequest(`/companies/${companyId}/forms/${id}`, "PUT", body);
      else await apiRequest(`/companies/${companyId}/forms`, "POST", body);
      navigate("/forms");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm("Delete this form? Tasks it already created stay.")) return;
    await apiRequest(`/companies/${companyId}/forms/${id}`, "DELETE").catch((err) => setError(err.message));
    navigate("/forms");
  };

  const mappedElsewhere = (i, v) => v && form.questions.some((q, j) => j !== i && q.maps_to === v);
  return (
    <form onSubmit={save} className="p-6 lg:p-8 max-w-3xl space-y-5">
      <Link to="/forms" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Request forms</Link>
      <h1 className="text-xl font-semibold text-gray-900">{id ? "Edit form" : "New request form"}</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <input required className={`${inputCls} w-full`} placeholder="Form name, e.g. IT help" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Form name" />
        <textarea rows={2} className={`${inputCls} w-full`} placeholder="Tell people when to use this form (optional)" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs text-gray-500">Requests go to project
            <select required className={`${inputCls} w-full mt-1`} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} aria-label="Project">
              <option value="">Pick a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.teams?.name ? ` · ${p.teams.name}` : ""}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Assign new requests to
            <select className={`${inputCls} w-full mt-1`} value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} aria-label="Assignee">
              <option value="">Whoever made the form</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Priority if not asked
            <select className={`${inputCls} w-full mt-1`} value={form.default_priority} onChange={(e) => setForm({ ...form, default_priority: e.target.value })}>
              {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.is_open} onChange={(e) => setForm({ ...form, is_open: e.target.checked })} /> Taking requests
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">Questions</p>
        {form.questions.map((q, i) => (
          <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
            <div className="flex gap-2">
              <input required className={`${inputCls} flex-1`} placeholder="Question" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} aria-label={`Question ${i + 1}`} />
              <select className={inputCls} value={q.kind} disabled={!!fieldKindFor(q.maps_to)} onChange={(e) => setQ(i, { kind: e.target.value })} aria-label={`Type of question ${i + 1}`}>
                {Q_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {q.kind === "select" && (
              <input className={`${inputCls} w-full`} placeholder="Choices, comma separated" value={q.options.join(", ")} disabled={q.maps_to === "priority" || q.maps_to?.startsWith("field:")}
                onChange={(e) => setQ(i, { options: e.target.value.split(",").map((o) => o.trimStart()) })} aria-label={`Choices for question ${i + 1}`} />
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <label className="flex items-center gap-1.5">Fills
                <select className={`${inputCls} py-1 text-xs`} value={q.maps_to || ""} onChange={(e) => mapTo(i, e.target.value)} aria-label={`Fills for question ${i + 1}`}>
                  {BUILT_IN.map(([v, l]) => <option key={v} value={v} disabled={mappedElsewhere(i, v)}>{l}</option>)}
                  {fields.filter((f) => f.kind !== "person" && f.kind !== "checkbox").map((f) => (
                    <option key={f.id} value={`field:${f.id}`} disabled={mappedElsewhere(i, `field:${f.id}`)}>Field: {f.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={q.required || q.maps_to === "title"} disabled={q.maps_to === "title"} onChange={(e) => setQ(i, { required: e.target.checked })} /> Required
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30" aria-label="Move up"><ArrowUp size={13} /></button>
                <button type="button" disabled={i === form.questions.length - 1} onClick={() => move(i, 1)} className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30" aria-label="Move down"><ArrowDown size={13} /></button>
                <button type="button" disabled={form.questions.length === 1} onClick={() => setForm({ ...form, questions: form.questions.filter((_, j) => j !== i) })} className="p-1 text-gray-400 hover:text-rose-500 disabled:opacity-30" aria-label="Remove question"><Trash2 size={13} /></button>
              </span>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setForm({ ...form, questions: [...form.questions, { id: newId(), label: "", kind: "text", required: false, maps_to: "", options: [] }] })}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 text-sm text-gray-600 rounded-md hover:border-gray-500 w-full justify-center">
          <Plus size={13} /> Add question
        </button>
        {!form.questions.some((q) => q.maps_to === "title") && <p className="text-xs text-amber-700">No question fills the title — tasks will be named "{form.name || "Form"}: person's name".</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50">{id ? "Save form" : "Create form"}</button>
        {id && <button type="button" onClick={remove} className="px-4 py-2 border border-gray-200 text-sm text-rose-600 rounded-md hover:bg-rose-50">Delete</button>}
      </div>
    </form>
  );
}

// ── Fill in ───────────────────────────────────────────────────────────────────
function FillForm({ companyId, id }) {
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiRequest(`/companies/${companyId}/forms/${id}`).then(setForm).catch((err) => setError(err.message));
  }, [companyId, id]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setDone(await apiRequest(`/companies/${companyId}/forms/${id}/submit`, "POST", { answers }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <div className="p-8 text-sm text-gray-400">{error || "Loading…"}</div>;
  if (done)
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center space-y-3">
          <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
          <p className="text-base font-semibold text-gray-900">Request sent</p>
          <p className="text-sm text-gray-500">It's now a task in {form.project?.name}. You'll be able to follow it there.</p>
          <div className="flex justify-center gap-2 pt-1">
            <Link to={`/tasks/${done.task_id}`} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md">Open the task</Link>
            <button onClick={() => { setDone(null); setAnswers({}); }} className="px-3 py-1.5 border border-gray-200 text-sm rounded-md">Send another</button>
          </div>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit} className="p-6 lg:p-8 max-w-2xl space-y-5">
      <Link to="/forms" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Request forms</Link>
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{form.name}</h1>
        {form.description && <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{form.description}</p>}
        <p className="text-xs text-gray-400 mt-1">Goes to {form.project?.name}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        {form.questions.map((q) => {
          const v = answers[q.id] ?? "";
          const set = (val) => setAnswers({ ...answers, [q.id]: val });
          const common = { id: `a-${q.id}`, required: q.required, className: `${inputCls} w-full`, value: v, onChange: (e) => set(e.target.value) };
          return (
            <div key={q.id}>
              <label htmlFor={`a-${q.id}`} className="block text-sm font-medium text-gray-800 mb-1">{q.label}{q.required && <span className="text-rose-500"> *</span>}</label>
              {q.kind === "textarea" ? <textarea rows={4} {...common} />
                : q.kind === "select" ? <select {...common}><option value="">Choose…</option>{q.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : <input type={q.kind === "number" ? "number" : q.kind === "date" ? "date" : "text"} step={q.kind === "number" ? "any" : undefined} {...common} />}
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {form.can_submit ? (
        <button disabled={busy} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50">{busy ? "Sending…" : "Send request"}</button>
      ) : <p className="text-sm text-gray-500">{form.is_open ? "Your role can't send requests." : "This form is closed."}</p>}
    </form>
  );
}

// ── Requests received ─────────────────────────────────────────────────────────
function Requests({ companyId, id }) {
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    apiRequest(`/companies/${companyId}/forms/${id}`).then(setForm).catch((err) => setError(err.message));
    apiRequest(`/companies/${companyId}/forms/${id}/submissions`).then(setRows).catch((err) => setError(err.message));
  }, [companyId, id]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-5">
      <Link to="/forms" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Request forms</Link>
      <h1 className="text-xl font-semibold text-gray-900">Requests · {form?.name}</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-2 py-2 font-medium">From</th>
              <th className="px-2 py-2 font-medium">Sent</th>
              <th className="px-4 py-2 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows?.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No requests yet.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.task ? <Link to={`/tasks/${r.task.id}`} className="text-gray-900 hover:underline">{r.task.title}</Link> : <span className="text-gray-400">Task removed</span>}</td>
                <td className="px-2 py-2 text-gray-600">{r.submitter?.name || r.submitter?.email || "—"}</td>
                <td className="px-2 py-2 text-gray-500">{new Date(r.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-4 py-2 text-right">{r.task && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.task.status]}`}>{r.task.status}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Forms() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const companyId = getWorkspace();
  if (!companyId) return <Navigate to="/dashboard" replace />;
  if (pathname === "/forms/new") return <FormBuilder companyId={companyId} />;
  if (id && pathname.endsWith("/edit")) return <FormBuilder companyId={companyId} id={id} />;
  if (id && pathname.endsWith("/requests")) return <Requests companyId={companyId} id={id} />;
  if (id) return <FillForm companyId={companyId} id={id} />;
  return <FormList companyId={companyId} />;
}
