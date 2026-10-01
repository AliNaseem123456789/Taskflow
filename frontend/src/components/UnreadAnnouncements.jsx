import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getWorkspace } from "../api/api";
import { useLiveEvent } from "../utils/live";

// Dashboard strip: company announcements you haven't read yet
export default function UnreadAnnouncements() {
  const companyId = getWorkspace();
  const [items, setItems] = useState([]);
  const load = useCallback(
    () => companyId && apiRequest(`/companies/${companyId}/announcements?unread=1`).then(setItems).catch(() => setItems([])),
    [companyId]
  );
  useEffect(() => { load(); }, [load]);
  useLiveEvent("notification", load);
  if (!items.length) return null;

  const markRead = (id) =>
    apiRequest(`/companies/${companyId}/announcements/${id}/read`, "POST").then(load).catch(() => {});

  return (
    <div className="bg-white border border-indigo-600 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Megaphone size={14} className="text-gray-700" />
        <p className="text-sm font-semibold text-gray-900 flex-1">{items.length === 1 ? "New announcement" : `${items.length} new announcements`}</p>
        <Link to="/announcements" className="text-xs text-gray-500 hover:text-gray-900">See all</Link>
      </div>
      {items.slice(0, 3).map((a) => (
        <div key={a.id} className="flex items-start gap-3 py-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">{a.title}</p>
            {a.body && <p className="text-xs text-gray-500 line-clamp-2">{a.body}</p>}
          </div>
          <button onClick={() => markRead(a.id)} className="text-xs px-2 py-1 border border-gray-200 rounded-md hover:bg-gray-50 shrink-0">Got it</button>
        </div>
      ))}
    </div>
  );
}
