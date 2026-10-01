import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox as InboxIcon } from "lucide-react";
import { apiRequest } from "../utils/api";
import { useLiveEvent } from "../utils/live";
import TaskMeta from "../components/TaskMeta";
import { STATUS_BADGE } from "../utils/taskMeta";
import AreaTile from "../components/AreaTile";

const TABS = [
  ["assigned", "Assigned to me"],
  ["reviewing", "To review"],
  ["watching", "Watching"],
];

// Everything waiting on me, from every company I'm in (Personal stays separate in My Dones)
export default function Inbox() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("assigned");
  const [company, setCompany] = useState("");

  const load = useCallback(
    () => apiRequest("/tasks/inbox", "GET", null, { personal: true }).then(setData).catch(() => setData({ assigned: [], reviewing: [], watching: [] })),
    []
  );
  useEffect(() => { load(); }, [load]);
  useLiveEvent(["task", "notification"], load);

  if (!data)
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );

  const companies = [...new Map([...data.assigned, ...data.reviewing, ...data.watching]
    .filter((t) => t.company).map((t) => [t.company.id, t.company])).values()];
  const rows = data[tab].filter((t) => !company || t.company?.id === company);

  // group by company so work from different places doesn't blur together
  const groups = rows.reduce((acc, t) => {
    const key = t.company?.name || "Personal";
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-5">
        <h1 className="page-title"><AreaTile />Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">Open work waiting on you, across all your companies.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-sm rounded-md ${tab === key ? "btn-accent " : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {label} <span className={tab === key ? "text-gray-300" : "text-gray-400"}>{data[key].length}</span>
            </button>
          ))}
        </div>
        {companies.length > 1 && (
          <select className="text-sm px-3 py-1.5 border border-gray-200 rounded-md bg-white ml-auto" value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl py-14 text-center text-gray-400">
          <InboxIcon size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nothing here. Nice.</p>
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(groups).map(([name, tasks]) => (
          <div key={name}>
            <p className="text-xs font-medium text-gray-500 mb-1.5">{name}</p>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {tasks.map((t) => (
                <Link key={t.id} to={`/tasks/${t.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{t.title}</p>
                    <TaskMeta task={t} showBlocker={false} />
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
