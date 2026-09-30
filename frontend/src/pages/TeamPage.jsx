import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, LogIn, ThumbsUp, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { apiRequest } from "../utils/api";
import { localDate, shiftDate } from "../utils/date";

const STATUS_BADGE = {
  Done:    "bg-emerald-50 text-emerald-700",
  Doing:   "bg-amber-50 text-amber-700",
  Delayed: "bg-rose-50 text-rose-700",
};

// ── No team state ─────────────────────────────────────────────────────────────
function NoTeam({ onCreate, onJoin }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "create") await onCreate(value.trim());
      else await onJoin(value.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-lg">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Team</h1>
        <p className="text-sm text-gray-500">
          Collaborate with your team — see everyone's dones in one place.
        </p>
      </div>

      {!mode ? (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMode("create")}
            className="border border-gray-200 rounded-lg p-5 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 bg-gray-100 rounded-md flex items-center justify-center mb-3">
              <Plus size={18} className="text-gray-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Create a team</h3>
            <p className="text-xs text-gray-500">Start a new workspace and invite others.</p>
          </button>

          <button
            onClick={() => setMode("join")}
            className="border border-gray-200 rounded-lg p-5 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 bg-gray-100 rounded-md flex items-center justify-center mb-3">
              <LogIn size={18} className="text-gray-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Join a team</h3>
            <p className="text-xs text-gray-500">Enter an invite code from your team admin.</p>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <button
            onClick={() => { setMode(null); setValue(""); setError(""); }}
            className="text-xs text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
          >
            <ChevronLeft size={12} /> Back
          </button>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {mode === "create" ? "Name your team" : "Enter invite code"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "create" ? "e.g. Engineering, Design…" : "e.g. XK9P2A"}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2.5 outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent uppercase-placeholder placeholder:normal-case"
            />
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={!value.trim() || loading}
              className="w-full bg-gray-900 text-white text-sm font-medium py-2.5 rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {loading ? "…" : mode === "create" ? "Create team" : "Join team"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Task card in feed ─────────────────────────────────────────────────────────
function FeedTaskCard({ task, currentUserId }) {
  const [liked, setLiked] = useState(
    task.reactions?.some((r) => r.user_id === currentUserId) ?? false
  );
  const [likeCount, setLikeCount] = useState(task.reactions?.length ?? 0);

  const handleReact = async () => {
    const res = await apiRequest(`/tasks/${task.id}/react`, "POST", {}).catch(() => null);
    if (!res) return;
    setLiked(res.liked);
    setLikeCount((c) => (res.liked ? c + 1 : c - 1));
  };

  const badge = STATUS_BADGE[task.status] || "bg-gray-50 text-gray-700";

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-gray-900 ${task.status === "Done" ? "line-through text-gray-400" : ""}`}>
          {task.title}
        </p>
        {task.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {task.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge}`}>
          {task.status}
        </span>
        <button
          onClick={handleReact}
          className={`flex items-center gap-1 text-[11px] transition-colors ${
            liked ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <ThumbsUp size={12} className={liked ? "fill-gray-900" : ""} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
      </div>
    </div>
  );
}

// ── Member card ───────────────────────────────────────────────────────────────
function MemberCard({ member, currentUserId }) {
  const initial = (member.name || member.email || "?")[0].toUpperCase();
  const done = member.tasks.filter((t) => t.status === "Done").length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center text-[11px] font-bold text-white">
            {initial}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {member.name || member.email}
              {member.id === currentUserId && (
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">you</span>
              )}
            </p>
            {member.role === "admin" && (
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Admin</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">{member.tasks.length}</p>
          <p className="text-[10px] text-gray-400">tasks</p>
        </div>
      </div>

      <div className="px-4 py-2">
        {member.tasks.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">Nothing logged today.</p>
        ) : (
          member.tasks.map((t) => (
            <FeedTaskCard key={t.id} task={t} currentUserId={currentUserId} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main TeamPage ─────────────────────────────────────────────────────────────
export default function TeamPage() {
  const navigate = useNavigate();
  const [teams, setTeams]             = useState([]);
  const [activeTeam, setActiveTeam]   = useState(null);
  const [feed, setFeed]               = useState([]);
  const [date, setDate]               = useState(localDate());
  const [loading, setLoading]         = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem("user"))?.id; } catch { return null; }
  })();

  useEffect(() => {
    apiRequest("/teams", "GET", null)
      .then((data) => {
        setTeams(data || []);
        if (data?.length > 0) setActiveTeam(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (!activeTeam) return;
    setFeedLoading(true);
    apiRequest(`/teams/${activeTeam.id}/feed?date=${date}`, "GET", null)
      .then(setFeed)
      .catch(() => setFeed([]))
      .finally(() => setFeedLoading(false));
  }, [activeTeam, date]);

  const handleCreate = async (name) => {
    const team = await apiRequest("/teams", "POST", { name });
    setTeams((prev) => [...prev, team]);
    setActiveTeam(team);
  };

  const handleJoin = async (invite_code) => {
    const { team } = await apiRequest("/teams/join", "POST", { invite_code });
    setTeams((prev) => [...prev, team]);
    setActiveTeam(team);
  };

  const stepDate = (dir) => {
    setDate(shiftDate(date, dir));
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (teams.length === 0) {
    return <NoTeam onCreate={handleCreate} onJoin={handleJoin} />;
  }

  const totalTasksToday = feed.reduce((s, m) => s + m.tasks.length, 0);
  const totalDone = feed.reduce((s, m) => s + m.tasks.filter((t) => t.status === "Done").length, 0);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-gray-900">
              {activeTeam?.name}
            </h1>
            {/* Team selector if multiple */}
            {teams.length > 1 && (
              <select
                value={activeTeam?.id}
                onChange={(e) => setActiveTeam(teams.find((t) => t.id === e.target.value))}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 outline-none"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {feed.length} member{feed.length !== 1 ? "s" : ""} &middot; {totalTasksToday} tasks today &middot; {totalDone} done
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date nav */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => stepDate(-1)}
              className="px-2 py-1.5 hover:bg-gray-50 text-gray-500 transition-colors border-r border-gray-200"
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={localDate()}
              className="text-xs px-2 py-1.5 outline-none bg-transparent"
            />
            <button
              onClick={() => stepDate(1)}
              disabled={date >= localDate()}
              className="px-2 py-1.5 hover:bg-gray-50 text-gray-500 transition-colors border-l border-gray-200 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            onClick={() => navigate(`/team/manage/${activeTeam.id}`)}
            className="flex items-center gap-1.5 text-xs border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Settings size={13} />
            Manage
          </button>
        </div>
      </div>

      {/* Feed */}
      {feedLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {feed.map((member) => (
            <MemberCard key={member.id} member={member} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}