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
  const [slackUrl, setSlackUrl] = useState("");
  const [slackStatus, setSlackStatus] = useState("");
  const [slackOn, setSlackOn] = useState(!!team.slack_connected);

  const saveSlack = async (webhook) => {
    setSlackStatus("Checking with Slack…");
    try {
      const r = await apiRequest(`/teams/${team.id}/slack`, "PUT", { webhook });
      setSlackOn(r.connected);
      setSlackUrl("");
      setSlackStatus(r.connected ? "Connected — a test message was posted" : "Removed");
    } catch (err) {
      setSlackStatus(err.message);
    }
  };

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
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-[17px] font-bold text-gray-900">Automatic daily digest</h2>
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
              className={`px-2.5 py-1 text-xs rounded-md border ${days.includes(d) ? "btn-accent border-indigo-600" : "border-gray-200 text-gray-500"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} className="px-3 py-1.5 btn-accent text-sm rounded-md">Save</button>
        {status && <span className="text-xs text-gray-500">{status}</span>}
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 mb-2">
          Also post the digest to a Slack channel {slackOn && <span className="text-emerald-600">· connected</span>}
        </p>
        <div className="flex gap-2">
          <input
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-md outline-none bg-white"
          />
          <button onClick={() => saveSlack(slackUrl)} disabled={!slackUrl}
            className="px-3 py-1.5 border border-gray-200 text-sm rounded-md hover:bg-gray-50 disabled:opacity-50">
            Connect
          </button>
          {slackOn && (
            <button onClick={() => saveSlack("")} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">Remove</button>
          )}
        </div>
        {slackStatus && <p className="text-xs text-gray-500 mt-1.5">{slackStatus}</p>}
      </div>
    </div>
  );
}
