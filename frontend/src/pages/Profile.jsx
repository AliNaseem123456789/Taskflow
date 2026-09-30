import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Monitor,
  Smartphone,
  Tablet,
  LogOut,
  ShieldAlert,
  MapPin,
  Loader2,
} from "lucide-react";
import api, { setAccessToken } from "../api/api";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const parseUserAgent = (ua = "") => {
  if (!ua) return { browser: "Unknown browser", os: "Unknown device", type: "desktop" };

  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\/|Opera/.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" :
    "Unknown browser";

  const os =
    /Windows NT 10/.test(ua) ? "Windows" :
    /Windows/.test(ua) ? "Windows" :
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" :
    "Unknown device";

  const type =
    /iPad|Tablet/.test(ua) ? "tablet" :
    /iPhone|Android|Mobile/.test(ua) ? "mobile" :
    "desktop";

  return { browser, os, type };
};

const relativeTime = (value) => {
  if (!value) return "unknown";

  // Postgres `timestamp without time zone` comes back without a zone marker,
  // so tell the parser it's UTC or the browser reads it as local time.
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const diff = Date.now() - new Date(normalized).getTime();

  if (Number.isNaN(diff)) return "unknown";
  if (diff < 60_000) return "just now";

  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(normalized).toLocaleDateString();
};

const deviceIcon = (type) =>
  type === "mobile" ? Smartphone : type === "tablet" ? Tablet : Monitor;

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      return null;
    }
  });

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);      // session being revoked
  const [confirmAll, setConfirmAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const clearLocalAuth = useCallback(() => {
    setAccessToken(null);
    localStorage.removeItem("user");
  }, []);

  const loadSessions = useCallback(async () => {
    const { data } = await api.get("/auth/sessions");
    setSessions(data.sessions || []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [me, sessionRes] = await Promise.all([
          api.get("/auth/me"),
          api.get("/auth/sessions"),
        ]);

        if (cancelled) return;

        setUser(me.data.user);
        localStorage.setItem("user", JSON.stringify(me.data.user));
        setSessions(sessionRes.data.sessions || []);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 401) {
          clearLocalAuth();
          navigate("/login");
          return;
        }
        setError(err.response?.data?.error || "Could not load your account.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate, clearLocalAuth]);

  /* ---------------------------------------------------------------- */

  const handleRevoke = async (session) => {
    setBusyId(session.id);
    setError("");
    try {
      await api.delete(`/auth/sessions/${session.id}`);

      if (session.current) {
        clearLocalAuth();
        navigate("/login");
        return;
      }
      await loadSessions();
    } catch (err) {
      setError(err.response?.data?.error || "Could not revoke that session.");
    } finally {
      setBusyId(null);
    }
  };

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    setError("");
    try {
      await api.post("/auth/logout-all", { keepCurrent: true });
      await loadSessions();
      setConfirmAll(false);
    } catch (err) {
      setError(err.response?.data?.error || "Could not sign out other devices.");
    } finally {
      setLoggingOutAll(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // revoke it locally regardless — a failed call shouldn't strand the user
    } finally {
      clearLocalAuth();
      navigate("/login");
    }
  };

  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const otherSessions = sessions.filter((s) => !s.current);
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account and signed-in devices
        </p>
      </div>

      {error && (
        <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Account ---------------------------------------------------- */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center text-lg font-semibold shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user?.name || "Unnamed user"}
            </p>
            <p className="text-sm text-gray-500 truncate">{user?.email}</p>
          </div>
          {user?.role && (
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
              {user.role}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Display name
            </p>
            <p className="text-sm text-gray-900 mt-1">{user?.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Email
            </p>
            <p className="text-sm text-gray-900 mt-1 truncate">{user?.email || "—"}</p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="mt-5 text-sm text-gray-400 font-medium cursor-not-allowed"
          title="Coming soon"
        >
          Edit profile
        </button>
      </div>

      {/* Active sessions -------------------------------------------- */}
      <div className="bg-white border border-gray-200 rounded-lg mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Active sessions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Devices currently signed in to your account
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400">No active sessions found.</p>
          </div>
        ) : (
          <ul>
            {sessions.map((session) => {
              const { browser, os, type } = parseUserAgent(session.user_agent);
              const Icon = deviceIcon(type);
              const place = [session.city, session.country]
                .filter(Boolean)
                .join(", ");

              return (
                <li
                  key={session.id}
                  className="px-5 py-4 flex items-center gap-4 border-b border-gray-50 last:border-0"
                >
                  <div className="bg-gray-50 p-2 rounded shrink-0">
                    <Icon size={16} className="text-gray-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-gray-900">
                        {browser} on {os}
                      </p>
                      {session.current && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-gray-400">
                      <span>{relativeTime(session.last_accessed_at)}</span>
                      {session.ip_address && (
                        <>
                          <span>·</span>
                          <span>{session.ip_address}</span>
                        </>
                      )}
                      {place && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <MapPin size={10} />
                            {place}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevoke(session)}
                    disabled={busyId === session.id}
                    className="text-xs font-medium text-gray-500 hover:text-rose-600 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {busyId === session.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : session.current ? (
                      "Sign out"
                    ) : (
                      "Revoke"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Danger zone ------------------------------------------------ */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="bg-rose-50 p-2 rounded shrink-0">
            <ShieldAlert size={16} className="text-rose-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-900">
              Sign out of all other devices
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Revokes every session except this one. Use this if you think
              someone else has access to your account.
              {otherSessions.length > 0 &&
                ` ${otherSessions.length} other session${
                  otherSessions.length === 1 ? "" : "s"
                } active.`}
            </p>

            {confirmAll ? (
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleLogoutAll}
                  disabled={loggingOutAll}
                  className="text-xs font-medium bg-rose-600 text-white px-3 py-1.5 rounded-md hover:bg-rose-700 disabled:opacity-50 transition-colors"
                >
                  {loggingOutAll ? "Signing out..." : "Yes, sign them out"}
                </button>
                <button
                  onClick={() => setConfirmAll(false)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAll(true)}
                disabled={otherSessions.length === 0}
                className="mt-3 text-xs font-medium border border-gray-200 px-3 py-1.5 rounded-md hover:border-rose-200 hover:text-rose-600 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-900 transition-colors"
              >
                Sign out other devices
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}