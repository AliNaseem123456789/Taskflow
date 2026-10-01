import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";

// Mentions are stored as @[Name](user-id) and shown as a bold @Name
const MENTION_RE = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;

export function CommentText({ text }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className="font-semibold text-gray-900">
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

// Comments under a task, with @mention autocomplete
export default function CommentPanel({ taskId }) {
  const [comments, setComments] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState(null);   // who can be mentioned
  const [mentionQuery, setMentionQuery] = useState(null); // text after "@", or null
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const userId = getStoredUser()?.id;

  useEffect(() => {
    apiRequest(`/tasks/${taskId}/comments`).then(setComments).catch(() => setComments([]));
  }, [taskId]);

  // Show the people list when the word being typed starts with "@"
  const onChange = (e) => {
    const value = e.target.value;
    setInput(value);
    const beforeCursor = value.slice(0, e.target.selectionStart);
    const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[2].toLowerCase());
      setHighlight(0);
      if (people === null)
        apiRequest(`/tasks/${taskId}/mentionable`).then(setPeople).catch(() => setPeople([]));
    } else {
      setMentionQuery(null);
    }
  };

  const matches =
    mentionQuery === null || !people
      ? []
      : people
          .filter((p) => `${p.name || ""} ${p.email}`.toLowerCase().includes(mentionQuery))
          .slice(0, 6);

  const pickPerson = (person) => {
    const el = inputRef.current;
    const cursor = el.selectionStart;
    const before = input.slice(0, cursor).replace(/@([^\s@]*)$/, "");
    const after = input.slice(cursor);
    const token = `@[${person.name || person.email}](${person.id}) `;
    setInput(before + token + after);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + token).length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickPerson(matches[highlight]); }
    else if (e.key === "Escape") setMentionQuery(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    const c = await apiRequest(`/tasks/${taskId}/comments`, "POST", { content: input }).catch(() => null);
    if (c) setComments((prev) => [...(prev || []), c]);
    setInput("");
    setLoading(false);
  };

  const remove = async (cId) => {
    await apiRequest(`/tasks/comments/${cId}`, "DELETE").catch(() => {});
    setComments((prev) => prev.filter((c) => c.id !== cId));
  };

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      {comments === null && <p className="text-xs text-gray-400 py-1">Loading comments…</p>}
      {comments?.map((c) => (
        <div key={c.id} className="flex items-start gap-2 py-1.5 group">
          <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[9px] font-semibold text-gray-500 shrink-0 mt-0.5">
            {(c.user?.name || c.user?.email || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-gray-700">{c.user?.name || c.user?.email}</span>
            <p className="text-xs text-gray-600 mt-0.5 break-words">
              <CommentText text={c.content} />
            </p>
          </div>
          {c.user_id === userId && (
            <button
              onClick={() => remove(c.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-rose-400 transition-all"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}

      <form onSubmit={submit} className="relative flex items-center gap-2 mt-1.5">
        <input
          ref={inputRef}
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          placeholder="Add a comment… type @ to mention a teammate"
          className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-400 bg-white"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="text-xs btn-accent px-2.5 py-1.5 rounded-md disabled:opacity-40 transition-colors"
        >
          Send
        </button>

        {mentionQuery !== null && people && (
          <ul className="absolute left-0 bottom-full mb-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
            {matches.length === 0 ? (
              <li className="px-3 py-1.5 text-xs text-gray-400">
                {people.length ? "No one matches" : "Only teammates can be mentioned"}
              </li>
            ) : (
              matches.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickPerson(p); }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${i === highlight ? "bg-gray-100" : ""}`}
                  >
                    <span className="font-medium text-gray-900">{p.name || p.email}</span>
                    {p.name && <span className="text-gray-400 ml-1">{p.email}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </form>
    </div>
  );
}
