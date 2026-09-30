import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users } from "lucide-react";
import { apiRequest } from "../utils/api";
import { getStoredUser, logout } from "../api/api";

// Landing page for an emailed team invite: /join?token=...
export default function JoinTeam() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const me = getStoredUser();

  useEffect(() => {
    apiRequest(`/teams/invites/lookup?token=${encodeURIComponent(token || "")}`)
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [token]);

  const accept = async () => {
    setJoining(true);
    setError("");
    try {
      await apiRequest("/teams/invites/accept", "POST", { token });
      navigate("/team");
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const wrongAccount = invite && me && me.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg p-6 text-center mt-10">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users size={18} className="text-gray-500" />
        </div>

        {!invite && !error && <p className="text-sm text-gray-400">Checking your invite…</p>}

        {invite && (
          <>
            <h1 className="text-lg font-semibold text-gray-900">Join {invite.team_name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {invite.invited_by} invited <b>{invite.email}</b>
            </p>

            {invite.status === "pending" && !wrongAccount && (
              <button
                onClick={accept}
                disabled={joining}
                className="mt-5 w-full bg-gray-900 text-white py-2 rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {joining ? "Joining…" : "Join team"}
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
          </>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
