import { useState, useEffect } from "react";
import { Plus, X, ChevronDown, Sparkles } from "lucide-react";
import AssigneeSuggest from "./AssigneeSuggest";
import { aiRequest, useAI } from "../utils/ai";
import TagInput from "./TagInput";
import { apiRequest } from "../utils/api";
import { STATUSES, PRIORITIES, RECURRENCES } from "../utils/taskMeta";
import { useMyProjects } from "../utils/projects";
import { useCompanyPeople } from "../utils/companyPeople";
import { getStoredUser } from "../api/api";

const smallInput =
  "text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-700";
const EMPTY_EXTRA = { status: "Done", priority: "medium", due_date: "", recurrence: "", blocker: "", project_id: "", team_id: "", assignee_id: "", description: "" };

export default function AddTaskForm({ onAdd, onCancel, dateLogged }) {
  const [title, setTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [extra, setExtra] = useState(EMPTY_EXTRA);
  const projects = useMyProjects();
  const { inCompany, members, teams } = useCompanyPeople();
  const me = getStoredUser();
  const ai = useAI();
  const [sentence, setSentence] = useState(null); // null = closed
  const [aiNote, setAiNote] = useState("");

  // "Ask Sara to update the runbook by Friday" -> fills the form for you to check
  const fillFromSentence = async () => {
    if (!sentence?.trim()) return;
    setAiNote("Reading…");
    try {
      const t = await aiRequest("/api/tasks/parse", { text: sentence });
      setTitle(t.title);
      setExtra((x) => ({
        ...x, status: "Doing", priority: t.priority || "medium", due_date: t.due_date || "", recurrence: t.recurrence || "",
        description: t.description || "", project_id: t.project_id || "", team_id: t.project_id ? "" : t.team_id || x.team_id,
        assignee_id: t.assignee_id && t.assignee_id !== me?.id ? t.assignee_id : "",
      }));
      setShowMore(true);
      setSentence(null);
      setAiNote(t.unmatched?.length ? `Couldn't find ${t.unmatched.join(", ")} — check the fields.` : "Filled in — check and press Add.");
    } catch (err) {
      setAiNote(err.message);
    }
  };
  // a company task lands on your team by default (if you're on exactly one)
  useEffect(() => {
    if (inCompany && teams.length === 1) setExtra((x) => (x.team_id ? x : { ...x, team_id: teams[0].id }));
  }, [inCompany, teams]);
  const setField = (key) => (e) => setExtra((x) => ({ ...x, [key]: e.target.value }));


  useEffect(() => {
    apiRequest("/tags", "GET", null)
      .then(setAllTags)
      .catch(() => {});
  }, []);

  const handleCreateTag = async (name, color) => {
    try {
      const tag = await apiRequest("/tags", "POST", { name, color });
      setAllTags((prev) => [...prev, tag]);
      return tag;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onAdd(title.trim(), selectedTags.map((t) => t.id), dateLogged, extra);
      setTitle("");
      setSelectedTags([]);
      setShowTags(false);
      setExtra(EMPTY_EXTRA);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-lg p-3 space-y-2"
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <Plus size={14} className="text-gray-400 shrink-0" />
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What did you accomplish?"
          className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"
        />
      </div>

      {ai.on && (sentence === null ? (
        <button type="button" onClick={() => setSentence("")} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700">
          <Sparkles size={11} /> Type it in a sentence
        </button>
      ) : (
        <div className="flex gap-2">
          <input autoFocus value={sentence} onChange={(e) => setSentence(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillFromSentence(); } if (e.key === "Escape") setSentence(null); }}
            placeholder='e.g. "Ask Sara to update the runbook by Friday, high priority"'
            className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white" />
          <button type="button" onClick={fillFromSentence} className="text-xs px-2 py-1 bg-gray-900 text-white rounded-md">Fill in</button>
        </div>
      ))}
      {aiNote && <p className="text-[11px] text-gray-500">{aiNote}</p>}

      {/* Tag picker + more options toggles */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors order-2"
        >
          <ChevronDown size={12} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
          More options
        </button>
      <div className="order-1">
        <button
          type="button"
          onClick={() => setShowTags((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${showTags ? "rotate-180" : ""}`}
          />
          {selectedTags.length > 0
            ? `${selectedTags.length} tag${selectedTags.length > 1 ? "s" : ""} selected`
            : "Add tags"}
        </button>

        {showTags && (
          <div className="mt-2">
            <TagInput
              selectedTags={selectedTags}
              onChange={setSelectedTags}
              allTags={allTags}
              onCreateTag={handleCreateTag}
            />
          </div>
        )}
      </div>
      </div>

      {showMore && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className={smallInput} value={extra.status} onChange={setField("status")} title="Status">
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className={smallInput} value={extra.priority} onChange={setField("priority")} title="Priority">
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label} priority</option>)}
          </select>
          <input type="date" className={smallInput} value={extra.due_date} onChange={setField("due_date")} title="Due date" />
          <select className={smallInput} value={extra.recurrence} onChange={setField("recurrence")} title="Repeat">
            {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {inCompany && (
            <>
              <select className={smallInput} value={extra.team_id} onChange={setField("team_id")} title="Team">
                <option value="">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className={smallInput} value={extra.assignee_id} onChange={setField("assignee_id")} title="Assign to">
                <option value="">Assign to me</option>
                {members.filter((m) => m.id !== me?.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.email}{m.away_until ? ` (away until ${m.away_until.slice(5)})` : ""}</option>
                ))}
              </select>
            </>
          )}
          {inCompany && (
            <AssigneeSuggest onPick={(id) => setExtra((x) => ({ ...x, assignee_id: id === me?.id ? "" : id }))}
              getInput={() => ({ title, description: extra.description, team_id: extra.team_id || null, due_date: extra.due_date || null })} />
          )}
          {projects.length > 0 && (
            <select className={`${smallInput} col-span-2 sm:col-span-4`} value={extra.project_id} onChange={setField("project_id")} title="Team project">
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.team_name})</option>)}
            </select>
          )}
          <input
            className={`${smallInput} col-span-2 sm:col-span-4`}
            value={extra.blocker}
            onChange={setField("blocker")}
            placeholder="What's blocking you? (optional)"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
        >
          <X size={12} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || loading}
          className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors font-medium"
        >
          {loading ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
