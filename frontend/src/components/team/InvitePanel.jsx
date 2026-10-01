import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { apiRequest } from "../../utils/api";

// Admin: invite people by email and see pending invites
export default function InvitePanel({ teamId }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => apiRequest(`/teams/${teamId}/invites`).then(setPending).catch(() => {});
  useEffect(() => { load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    try {
      const inv = await apiRequest(`/teams/${teamId}/invites`, "POST", { email });
      setMessage(inv.email_sent ? `Invite sent to ${inv.email}` : `Invite created, but the email couldn't be sent. Check the Gmail settings.`);
      setEmail("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const revoke = async (inviteId) => {
    await apiRequest(`/teams/${teamId}/invites/${inviteId}`, "DELETE").catch(() => {});
    load();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <h2 className="font-display text-[17px] font-bold text-gray-900">Invite by email</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">They get a link that works for 7 days.</p>
      <form onSubmit={invite} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white"
        />
        <button disabled={sending} className="flex items-center gap-1.5 px-3 py-2 btn-accent text-sm rounded-md disabled:opacity-50">
          <Send size={13} /> {sending ? "Sending…" : "Invite"}
        </button>
      </form>
      {message && <p className="text-xs text-emerald-600 mt-2">{message}</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {pending.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {pending.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">{inv.email}</span>
              <span className="flex items-center gap-3 text-xs text-gray-400">
                expires {new Date(inv.expires_at).toLocaleDateString()}
                <button onClick={() => revoke(inv.id)} className="p-1 hover:text-rose-500" title="Cancel invite">
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
