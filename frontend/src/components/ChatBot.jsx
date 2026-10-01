import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, Check } from "lucide-react";
import { AI_URL, aiRequest, useAI } from "../utils/ai";
import { apiRequest } from "../utils/api";
import { getWorkspace, isLoggedIn } from "../api/api";
import Markdown from "./Markdown";

// Match a name the AI wrote ("Bo", "sara k") to a company member
const findPerson = (name, members) => {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  return members.find((m) => [m.name, m.email].some((v) => (v || "").toLowerCase() === n)) ||
    members.find((m) => (m.name || "").toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]) || null;
};

// Tasks the assistant suggested: nothing is created until you press the button
function Proposals({ items, onDone }) {
  const [picked, setPicked] = useState(items.map(() => true));
  const [state, setState] = useState("");
  const create = async () => {
    setState("Creating…");
    const companyId = getWorkspace();
    const members = companyId ? await apiRequest(`/companies/${companyId}/members`).catch(() => []) : [];
    let made = 0;
    for (const [i, t] of items.entries()) {
      if (!picked[i]) continue;
      const who = companyId ? findPerson(t.assignee_name, members) : null;
      try {
        await apiRequest("/tasks", "POST", {
          title: t.title, description: t.description || undefined, priority: t.priority || undefined,
          due_date: /^\d{4}-\d{2}-\d{2}$/.test(t.due_date || "") ? t.due_date : undefined,
          ...(who ? { assignee_id: who.id } : {}),
        });
        made++;
      } catch {
        // skip the ones the server refuses (e.g. not allowed)
      }
    }
    setState(`Created ${made} task${made === 1 ? "" : "s"}.`);
    onDone?.();
  };
  return (
    <div className="border border-gray-200 rounded-md p-2 bg-white space-y-1.5">
      {items.map((t, i) => (
        <label key={i} className="flex items-start gap-2 text-xs text-gray-800">
          <input type="checkbox" className="mt-0.5" checked={picked[i]} disabled={!!state}
            onChange={() => setPicked(picked.map((v, j) => (j === i ? !v : v)))} />
          <span>
            {t.title}
            <span className="text-gray-400">
              {[t.assignee_name && `→ ${t.assignee_name}`, t.due_date && `due ${t.due_date}`, t.priority].filter(Boolean).map((x) => ` · ${x}`)}
            </span>
          </span>
        </label>
      ))}
      {state ? (
        <p className="text-xs text-emerald-700 flex items-center gap-1"><Check size={12} /> {state}</p>
      ) : (
        <button onClick={create} disabled={!picked.some(Boolean)}
          className="w-full text-xs py-1.5 rounded-md btn-accent disabled:opacity-40">
          Create {picked.filter(Boolean).length} task{picked.filter(Boolean).length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

// Floating assistant. Signed in: knows your work (only what you can see).
// On the landing page: answers questions about Taskflow.
export default function Chatbot() {
  const ai = useAI();
  const signedIn = isLoggedIn();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: signedIn
        ? "Hi! Ask me about your work — what's due, who's overloaded, what we decided, or what the wiki says. I can also suggest tasks."
        : "Hi! Ask me anything about Taskflow.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  if (!AI_URL || !ai.on) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const history = messages.slice(1).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsLoading(true);
    try {
      const data = signedIn
        ? await aiRequest("/api/chat", { message: text, history })
        : await fetch(`${AI_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, history }),
          }).then((r) => r.json());
      setMessages((prev) => [...prev, { role: "assistant", text: data.response || "Sorry, I couldn't process that.", proposals: data.proposals }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: err.message || "Connection error. Please try again.", error: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open assistant"
        className="fixed bottom-6 right-6 w-11 h-11 btn-accent rounded-full flex items-center justify-center shadow-lg transition-colors z-50">
        <MessageCircle size={18} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-gray-700" />
          <span className="text-sm font-semibold text-gray-900">Assistant</span>
          {signedIn && <span className="text-[10px] text-gray-400">sees only what you can see</span>}
        </div>
        <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400" aria-label="Close assistant">
          <X size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 p-4 min-h-[16rem] overflow-y-auto space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : "space-y-2"}>
            <div className={`max-w-[90%] px-3 py-2 rounded-lg text-sm ${
              msg.role === "user" ? "btn-accent " : msg.error ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-800"
            }`}>
              {msg.role === "user" ? msg.text : <Markdown text={msg.text} />}
            </div>
            {msg.proposals?.length > 0 && <Proposals items={msg.proposals} />}
          </div>
        ))}
        {isLoading && <div className="text-xs text-gray-400 animate-pulse">Looking into it…</div>}
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={signedIn ? "e.g. What's overdue on my team?" : "Type a message..."}
          className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent" disabled={isLoading} />
        <button onClick={handleSend} disabled={isLoading || !input.trim()} aria-label="Send"
          className="p-1.5 rounded-md btn-accent disabled:opacity-30 transition-colors">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
