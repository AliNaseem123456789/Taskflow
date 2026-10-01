import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, AtSign, MessageCircle, Check } from "lucide-react";
import { apiRequest } from "../utils/api";
import { useLiveEvent } from "../utils/live";

const POLL_MS = 60 * 1000;
const ICON = { mention: AtSign, comment: MessageCircle };

const timeAgo = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

// Bell with unread count; checks for new notifications every minute.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });
  const ref = useRef(null);

  const load = useCallback(
    () => apiRequest("/notifications").then(setData).catch(() => {}),
    []
  );

  useLiveEvent("notification", load, 200);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    // other parts of the app can ask for a refresh (e.g. realtime updates)
    window.addEventListener("notifications:refresh", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("notifications:refresh", load);
    };
  }, [load]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read_at) {
      await apiRequest(`/notifications/${n.id}/read`, "PUT").catch(() => {});
      load();
    }
    if (n.link) navigate(n.link);
  };

  const readAll = async () => {
    await apiRequest("/notifications/read-all", "POST").catch(() => {});
    load();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        title="Notifications"
      >
        <Bell size={16} />
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {data.unread > 0 && (
              <button onClick={readAll} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-gray-400">Nothing yet</li>
            )}
            {data.items.map((n) => {
              const Icon = ICON[n.type] || Bell;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`w-full text-left flex gap-2.5 px-3 py-2.5 hover:bg-gray-50 ${n.read_at ? "" : "bg-gray-50"}`}
                  >
                    <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-xs ${n.read_at ? "text-gray-500" : "text-gray-900 font-medium"}`}>
                        {n.message}
                      </span>
                      <span className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
