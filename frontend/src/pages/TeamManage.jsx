import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Copy, Check, RefreshCw, Trash2, LogOut, Shield, User, BarChart3,
  ArrowLeft, Mail, ChevronDown
} from "lucide-react";
import { apiRequest } from "../utils/api";
import { localMonth } from "../utils/date";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatRow({ stat }) {
  const pct = stat.completion_rate;
  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3 mb-1.5">
        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
          {(stat.name || stat.email || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900 truncate">
              {stat.name || stat.email}
            </span>
            <span className="text-xs font-semibold text-gray-700 ml-2">{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-4 pl-9 text-[11px] text-gray-500">
        <span>✅ {stat.done} done</span>
        <span>🔄 {stat.doing} doing</span>
        <span>⏰ {stat.delayed} delayed</span>
        <span>📅 {stat.active_days} active days</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TeamManage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [team, setTeam]           = useState(null);
  const [stats, setStats]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("members"); // members | stats
  const [statsMonth, setStatsMonth] = useState(localMonth());
  const [digestSent, setDigestSent] = useState(false);
  const [sending, setSending]     = useState(false);

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem("user"))?.id; } catch { return null; }
  })();

  const isOwner = team?.owner_id === currentUserId;
  const myRole  = team?.my_role;

  const fetchTeam = () =>
    apiRequest(`/teams/${id}`, "GET", null).then(setTeam).catch(() => navigate("/team"));

  const fetchStats = (month = statsMonth) =>
    apiRequest(`/teams/${id}/stats?month=${month}`, "GET", null)
      .then(setStats)
      .catch(() => {});

  useEffect(() => {
    Promise.all([fetchTeam(), fetchStats()]).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "stats") fetchStats(statsMonth);
  }, [statsMonth, tab]);

  const handleRemoveMember = async (userId) => {
    if (!window.confirm("Remove this member?")) return;
    await apiRequest(`/teams/${id}/members/${userId}`, "DELETE", null).catch(() => {});
    setTeam((t) => ({ ...t, members: t.members.filter((m) => m.id !== userId) }));
  };

  const handleRoleChange = async (userId, role) => {
    await apiRequest(`/teams/${id}/members/${userId}/role`, "PUT", { role }).catch(() => {});
    setTeam((t) => ({
      ...t,
      members: t.members.map((m) => (m.id === userId ? { ...m, role } : m)),
    }));
  };

  const handleRegenerate = async () => {
    if (!window.confirm("Generate a new invite code? The old one will stop working.")) return;
    const updated = await apiRequest(`/teams/${id}/regenerate-invite`, "POST", {}).catch(() => null);
    if (updated) setTeam((t) => ({ ...t, invite_code: updated.invite_code }));
  };

  const handleLeave = async () => {
    if (!window.confirm("Leave this team?")) return;
    await apiRequest(`/teams/${id}/leave`, "POST", {}).catch(() => {});
    navigate("/team");
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this team? This cannot be undone.")) return;
    await apiRequest(`/teams/${id}`, "DELETE", null).catch(() => {});
    navigate("/team");
  };

  const sendDigest = async () => {
    setSending(true);
    await apiRequest(`/teams/${id}/digest`, "POST", {}).catch(() => {});
    setSending(false);
    setDigestSent(true);
    setTimeout(() => setDigestSent(false), 3000);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => navigate("/team")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft size={14} /> Back to feed
      </button>

      {/* Team header */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{team.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{team.members.length} members</p>
          </div>
          {isOwner && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 border border-gray-200 px-2 py-0.5 rounded">
              Owner
            </span>
          )}
        </div>

        {/* Invite code */}
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-3">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">
            Invite code
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xl font-mono font-bold text-gray-900 tracking-widest">
              {team.invite_code}
            </span>
            <div className="flex items-center gap-3">
              <CopyBtn text={team.invite_code} />
              {isOwner && (
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <RefreshCw size={13} /> Regenerate
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Send digest */}
        {myRole === "admin" && (
          <button
            onClick={sendDigest}
            disabled={sending || digestSent}
            className="mt-3 flex items-center gap-2 text-xs border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Mail size={13} />
            {digestSent ? "✓ Digest sent!" : sending ? "Sending…" : "Send today's digest email"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {["members", "stats"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "members" ? `Members (${team.members.length})` : "Stats"}
          </button>
        ))}
      </div>

      {/* Members tab */}
      {tab === "members" && (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-50">
          {team.members.map((member) => (
            <div key={member.id} className="px-4 py-3 flex items-center gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-semibold text-gray-500 shrink-0">
                {(member.name || member.email || "?")[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {member.name || member.email}
                  {member.id === currentUserId && (
                    <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(you)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 truncate">{member.email}</p>
              </div>

              {/* Role badge / selector */}
              {isOwner && member.id !== currentUserId ? (
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  {member.role === "admin" ? <Shield size={12} /> : <User size={12} />}
                  {member.role}
                </span>
              )}

              {/* Remove (admin only, not self) */}
              {myRole === "admin" && member.id !== currentUserId && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="text-gray-300 hover:text-rose-400 transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats tab */}
      {tab === "stats" && (
        <div>
          {/* Month picker */}
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs text-gray-500">Month:</label>
            <input
              type="month"
              value={statsMonth}
              onChange={(e) => setStatsMonth(e.target.value)}
              max={localMonth()}
              className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 outline-none"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
            {stats.map((s) => <StatRow key={s.id} stat={s} />)}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="mt-8 border border-rose-100 rounded-lg p-4 bg-rose-50">
        <h3 className="text-sm font-semibold text-rose-700 mb-3">Danger zone</h3>
        <div className="flex flex-wrap gap-3">
          {!isOwner && (
            <button
              onClick={handleLeave}
              className="flex items-center gap-1.5 text-xs text-rose-600 border border-rose-200 bg-white px-3 py-1.5 rounded-md hover:bg-rose-50 transition-colors"
            >
              <LogOut size={13} /> Leave team
            </button>
          )}
          {isOwner && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-xs text-white bg-rose-500 px-3 py-1.5 rounded-md hover:bg-rose-600 transition-colors"
            >
              <Trash2 size={13} /> Delete team
            </button>
          )}
        </div>
      </div>
    </div>
  );
}