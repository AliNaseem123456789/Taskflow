import { useState } from "react";
import { Loader2 } from "lucide-react";
import api, { setStoredUser, browserTimezone } from "../api/api";

const inputCls =
  "w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white text-gray-900";
const labelCls = "text-xs font-medium text-gray-500 uppercase tracking-wide";

// Every timezone the browser knows, e.g. "Asia/Karachi"
const TIMEZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [browserTimezone(), "UTC"];

// ── Edit name + timezone ─────────────────────────────────────────────────────
export function EditProfileForm({ user, onSaved, onCancel }) {
  const [name, setName] = useState(user?.name || "");
  const [timezone, setTimezone] = useState(user?.timezone || browserTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/auth/me", { name, timezone });
      setStoredUser(data.user);
      onSaved(data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 pt-5 border-t border-gray-100 space-y-4">
      <div>
        <label className={labelCls}>Display name</label>
        <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </div>
      <div>
        <label className={labelCls}>Timezone</label>
        <select className={`${inputCls} mt-1`} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Used for "today", streaks and reminder times.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Change password ──────────────────────────────────────────────────────────
export function ChangePasswordForm({ onChanged }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setDone("");
    if (newPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (newPassword !== confirm) return setError("The new passwords don't match.");

    setSaving(true);
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword, newPassword });
      setDone(data.message);
      setCurrent("");
      setNew("");
      setConfirm("");
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || "Could not change your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-6">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Password</h2>
        <p className="text-xs text-gray-500 mt-0.5">Changing it logs out your other devices</p>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-3 max-w-sm">
        <input type="password" placeholder="Current password" autoComplete="current-password"
          className={inputCls} value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        <input type="password" placeholder="New password (8+ characters)" autoComplete="new-password"
          className={inputCls} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
        <input type="password" placeholder="Repeat new password" autoComplete="new-password"
          className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-emerald-600">{done}</p>}
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Change password
        </button>
      </form>
    </div>
  );
}
