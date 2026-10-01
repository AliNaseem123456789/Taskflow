import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../utils/api";
import { useLiveEvent } from "../utils/live";
import { ApprovalRow } from "../components/TaskApprovals";
import AreaTile from "../components/AreaTile";

const TABS = [
  ["to_me:pending", "Waiting for me"],
  ["by_me:pending", "Asked by me"],
  ["to_me:decided", "I decided"],
  ["by_me:decided", "Answered"],
];

// Approvals: what's waiting for your decision, and what you've asked others to approve
export default function Approvals() {
  const [tab, setTab] = useState(TABS[0][0]);
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState("");
  const [box, status] = tab.split(":");

  const load = useCallback(() => {
    apiRequest(`/approvals?box=${box}&status=${status}`).then(setRows).catch((err) => setError(err.message));
    Promise.all(["to_me", "by_me"].map((b) => apiRequest(`/approvals?box=${b}&status=pending`).then((r) => r.length).catch(() => 0)))
      .then(([a, b]) => setCounts({ "to_me:pending": a, "by_me:pending": b }));
  }, [box, status]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useLiveEvent(["notification", "task"], load);

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-5">
      <div>
        <h1 className="page-title"><AreaTile /> Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Sign-offs on tasks. Ask for one from any company task's page.</p>
      </div>
      <div className="flex gap-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`pb-2 text-sm -mb-px border-b-2 whitespace-nowrap ${tab === k ? "border-indigo-600 text-indigo-700 font-semibold" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
            {l}{counts[k] ? <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full btn-accent ">{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows === null && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {rows?.length === 0 && <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">Nothing here.</div>}
      {rows?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 divide-y divide-gray-50">
          {rows.map((a) => <ApprovalRow key={a.id} a={a} opts={{ company: a.company_id }} onChange={load} showTask />)}
        </div>
      )}
    </div>
  );
}
