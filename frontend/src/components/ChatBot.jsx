import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("https://idonethis-1.onrender.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.response || "Sorry, I couldn't process that." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Connection error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-11 h-11 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-800 transition-colors z-50"
      >
        <MessageCircle size={18} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
          <span className="text-sm font-semibold text-gray-900">Assistant</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-gray-100 text-gray-400"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 p-4 h-64 overflow-y-auto space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
              msg.role === "user"
                ? "bg-gray-900 text-white self-end ml-auto"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {isLoading && (
          <div className="text-xs text-gray-400 animate-pulse">Thinking...</div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="p-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}