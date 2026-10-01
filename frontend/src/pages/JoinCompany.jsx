import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser, logout, switchWorkspace } from "../api/api";
import { ROLE_LABELS } from "../utils/workspace";

// Landing page for an emailed company invite: /join-company?token=...
export default function JoinCompany() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const me = getStoredUser();

  useEffect(() => {
    apiRequest(`/companies/invites/lookup?token=${encodeURIComponent(token || "")}`, "GET", null, { personal: true })
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [token]);

  const accept = async () => {
    setJoining(true);
    setError("");
    try {
      const out = await apiRequest("/companies/invites/accept", "POST", { token }, { personal: true });
      switchWorkspace(out.company_id); // lands on the dashboard inside the company
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  };

  const wrongAccount = invite && me && me.email.toLowerCase() !== invite.email.toLowerCase();
  const where = invite && [invite.team_name && `the ${invite.team_name} team`, invite.project_name && `the ${invite.project_name} project`].filter(Boolean).join(" and ");

  return (
    <div className="p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6 text-center mt-10">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Building2 size={18} className="text-gray-500" />
        </div>

        {!invite && !error && <p className="text-sm text-gray-400">Checking your invite…</p>}

        {invite && (
          <>
            <h1 className="text-lg font-semibold text-gray-900">Join {invite.company_name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {invite.invited_by} invited <b>{invite.email}</b> as {ROLE_LABELS[invite.role]}
              {where && <> to work on {where}</>}.
            </p>
            {invite.status === "pending" && !wrongAccount && (
              <button onClick={accept} disabled={joining}
                className="mt-5 w-full btn-accent py-2 rounded-md text-sm font-medium disabled:opacity-50">
                {joining ? "Joining…" : "Join company"}
              </button>
            )}
            {invite.status === "pending" && wrongAccount && (
              <div className="mt-5 text-sm text-gray-600">
                You're logged in as <b>{me.email}</b>.
                <button onClick={logout} className="block w-full mt-3 border border-gray-200 py-2 rounded-md hover:bg-gray-50">
                  Log out and switch account
                </button>
              </div>
            )}
            {invite.status === "accepted" && <p className="mt-5 text-sm text-gray-500">This invite was already used.</p>}
            {invite.status === "expired" && <p className="mt-5 text-sm text-gray-500">This invite has expired. Ask for a new one.</p>}
            <p className="mt-4 text-xs text-gray-400">Your personal dones stay private; the company only sees its own work.</p>
          </>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
