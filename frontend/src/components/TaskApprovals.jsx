import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Check, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser } from "../api/api";
import { useMembersOf } from "../utils/fields";

const inputCls = "text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const APPROVAL_STATUS = {
  pending: { label: "Waiting", chip: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", chip: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", chip: "bg-rose-50 text-rose-700" },
  cancelled: { label: "Withdrawn", chip: "bg-gray-100 text-gray-500" },
};

// One approval request, with approve/reject for the approver and withdraw for the requester
export function ApprovalRow({ a, opts, onChange, showTask }) {
  const me = getStoredUser()?.id;
  const [comment, setComment] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState("");
  const s = APPROVAL_STATUS[a.status];
  const act = async (fn) => {
    setError("");
    try { await fn(); onChange(); } catch (err) { setError(err.message); }
  };
  const decide = (decision) => act(() => apiRequest(`/approvals/${a.id}/decide`, "POST", { decision, comment }, opts));

  return (
    <div className="py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.chip}`}>{s.label}</span>
        {showTask && <Link to={`/tasks/${a.task.id}`} className="text-gray-900 font-medium hover:underline">{a.task.title}</Link>}
        <span className="text-gray-700">{showTask ? "" : <><b className="font-medium">{a.approver?.name || a.approver?.email}</b> </>}
          <span className="text-gray-400">asked by {a.requested_by === me ? "you" : a.requester?.name || a.requester?.email}{showTask && a.approver_id !== me ? ` · to ${a.approver?.name || a.approver?.email}` : ""} · {new Date(a.created_at).toLocaleDateString()}</span>
        </span>
        {a.status === "pending" && a.requested_by === me && (
          <button onClick={() => act(() => apiRequest(`/approvals/${a.id}`, "DELETE", null, opts))} className="ml-auto text-xs text-gray-400 hover:text-gray-900">Withdraw</button>
        )}
      </div>
      {a.note && <p className="text-xs text-gray-600 pl-1">“{a.note}”</p>}
      {a.comment && <p className="text-xs text-gray-700 pl-1"><span className="text-gray-400">{a.status === "approved" ? "Approved" : "Rejected"} with:</span> {a.comment}</p>}
      {a.status === "pending" && a.approver_id === me && (
        deciding ? (
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} flex-1 min-w-48`} placeholder="Comment (needed to reject)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Decision comment" />
            <button onClick={() => decide("approve")} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-md hover:bg-emerald-700"><Check size={12} /> Approve</button>
            <button onClick={() => decide("reject")} className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 text-white text-xs rounded-md hover:bg-rose-700"><X size={12} /> Reject</button>
          </div>
        ) : (
          <button onClick={() => setDeciding(true)} className="text-xs px-3 py-1.5 btn-accent rounded-md">Review and decide</button>
        )
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Approvals on a company task: who was asked, what they said, and asking someone new
export default function TaskApprovals({ task, opts }) {
  const [data, setData] = useState(null);
  const [asking, setAsking] = useState(false);
  const [pick, setPick] = useState([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const people = useMembersOf(task.company_id);
  const me = getStoredUser()?.id;

  const load = useCallback(
    () => apiRequest(`/tasks/${task.id}/approvals`, "GET", null, opts).then(setData).catch(() => setData(null)),
    [task.id, opts.company] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await apiRequest(`/tasks/${task.id}/approvals`, "POST", { approver_ids: pick, note }, opts);
      setAsking(false); setPick([]); setNote("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!data || (!data.approvals.length && !data.can_request)) return null;
  const pending = data.approvals.filter((a) => a.status === "pending").length;
  const approved = data.approvals.filter((a) => a.status === "approved").length;
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <BadgeCheck size={14} className="text-gray-400" />
        <h2 className="font-display text-[17px] font-bold text-gray-900 flex-1">
          Approvals {data.approvals.length > 0 && <span className="font-normal text-gray-500">· {approved} approved{pending ? `, ${pending} waiting` : ""}</span>}
        </h2>
        {data.can_request && !asking && <button onClick={() => setAsking(true)} className="text-xs px-2.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50">Ask for approval</button>}
      </div>
      {data.approvals.length === 0 && !asking && <p className="text-xs text-gray-400">Need a sign-off before this goes ahead? Ask someone to approve it.</p>}
      {asking && (
        <form onSubmit={send} className="space-y-2 my-2">
          <div className="flex flex-wrap gap-1.5">
            {people.list.filter((m) => m.id !== me && m.role !== "viewer").map((m) => (
              <button type="button" key={m.id} onClick={() => setPick(pick.includes(m.id) ? pick.filter((x) => x !== m.id) : [...pick, m.id])}
                className={`text-xs px-2.5 py-1 rounded-full border ${pick.includes(m.id) ? "btn-accent border-indigo-600" : "border-gray-200 text-gray-700 hover:border-gray-400"}`}>
                {m.name || m.email}
              </button>
            ))}
          </div>
          <input className={`${inputCls} w-full`} placeholder="What should they look at? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={!pick.length} className="px-3 py-1.5 btn-accent text-xs rounded-md disabled:opacity-50">Send request{pick.length > 1 ? `s (${pick.length})` : ""}</button>
            <button type="button" onClick={() => setAsking(false)} className="px-3 py-1.5 border border-gray-200 text-xs rounded-md">Cancel</button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
      <div className="divide-y divide-gray-50">
        {data.approvals.map((a) => <ApprovalRow key={a.id} a={a} opts={opts} onChange={load} />)}
      </div>
    </section>
  );
}
