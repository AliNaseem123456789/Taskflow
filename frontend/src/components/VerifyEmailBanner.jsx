import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";

// Shown on app pages until the user verifies their email. Never blocks anything.
export default function VerifyEmailBanner() {
  const user = getStoredUser();
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user || user.email_verified !== false || hidden) return null;

  const resend = async () => {
    setSending(true);
    try {
      const data = await apiRequest("/auth/send-verification", "POST");
      setMessage(data.message);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-sm">
      <MailWarning size={16} className="shrink-0" />
      <span className="flex-1">
        {message || <>Please verify <b>{user.email}</b>. Check your inbox for the link.</>}
      </span>
      {!message && (
        <button onClick={resend} disabled={sending} className="font-medium underline disabled:opacity-50">
          {sending ? "Sending..." : "Resend email"}
        </button>
      )}
      <button onClick={() => setHidden(true)} className="p-1 hover:bg-amber-100 rounded" aria-label="Hide">
        <X size={14} />
      </button>
    </div>
  );
}
