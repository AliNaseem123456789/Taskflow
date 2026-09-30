import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../utils/api";
import AuthCard, { authInputCls, authButtonCls } from "../components/AuthCard";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setLoading(true);
    try {
      await apiRequest("/auth/reset-password", "POST", { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title="Link is missing" subtitle="Open the link from your email again.">
        <Link to="/forgot-password" className={`${authButtonCls} block text-center`}>Request a new link</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You'll be logged out of every device">
      {done ? (
        <div className="space-y-4">
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-3">
            Your password was updated.
          </div>
          <Link to="/login" className={`${authButtonCls} block text-center`}>Sign in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>
          )}
          <input type="password" required autoComplete="new-password" placeholder="New password (8+ characters)"
            value={password} onChange={(e) => setPassword(e.target.value)} className={authInputCls} />
          <input type="password" required autoComplete="new-password" placeholder="Repeat new password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInputCls} />
          <button type="submit" disabled={loading} className={authButtonCls}>
            {loading ? "Saving..." : "Save password"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
