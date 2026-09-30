import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../utils/api";
import AuthCard, { authInputCls, authButtonCls } from "../components/AuthCard";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/forgot-password", "POST", { email });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Forgot your password?" subtitle="We'll email you a link to reset it">
      {message ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-3">
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={authInputCls}
          />
          <button type="submit" disabled={loading} className={authButtonCls}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <p className="text-center text-sm text-gray-500 mt-6">
        <Link to="/login" className="text-gray-900 font-medium hover:underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
