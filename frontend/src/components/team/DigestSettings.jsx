import { useState } from "react";
import { apiRequest } from "../../utils/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const selectCls = "text-sm px-2 py-1.5 border border-gray-200 rounded-md outline-none bg-white text-gray-700";

// Admin: send the team digest automatically
export default function DigestSettings({ team, onSaved }) {
  const [clock, meridian] = (team.digest_time || "06:00 PM").split(" ");
  const [hour, minute] = clock.split(":");
  const [enabled, setEnabled] = useState(!!team.digest_enabled);
  const [time, setTime] = useState({ hour, minute, meridian });
  const [days, setDays] = useState(team.digest_days || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [status, setStatus] = useState("");

  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = async () => {
    setStatus("Saving…");
    try {
      const data = await apiRequest(`/teams/${team.id}/digest-settings`, "PUT", {
        enabled,
        time: `${time.hour}:${time.minute} ${time.meridian}`,
        days,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      onSaved?.(data);
      setStatus(enabled ? `Saved — sends at ${data.digest_time} (${data.digest_timezone})` : "Saved — automatic digest is off");
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Automatic daily digest</h2>
          <p className="text-xs text-gray-500 mt-0.5">Emails everyone what the team did and planned.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
          On
        </label>
      </div>

      <div className={`mt-4 space-y-3 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          Send at
          <select className={selectCls} value={time.hour} onChange={(e) => setTime({ ...time, hour: e.target.value })}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((h) => <option key={h}>{h}</option>)}
          </select>
          :
          <select className={selectCls} value={time.minute} onChange={(e) => setTime({ ...time, minute: e.target.value })}>
            {["00", "15", "30", "45"].map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className={selectCls} value={time.meridian} onChange={(e) => setTime({ ...time, meridian: e.target.value })}>
            <option>AM</option>
            <option>PM</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`px-2.5 py-1 text-xs rounded-md border ${days.includes(d) ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800">Save</button>
        {status && <span className="text-xs text-gray-500">{status}</span>}
      </div>
    </div>
  );
}
