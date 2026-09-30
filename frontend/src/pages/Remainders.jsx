import React, { useState, useEffect } from "react";
import { apiRequest } from "../utils/api";
import { Link } from "react-router-dom";

const CHANNELS = ["Email", "SMS", "Slack", "Push"];
import {
  Checkbox,
  FormControlLabel,
  Switch,
  MenuItem,
  Select,
  Button,
} from "@mui/material";
export default function Remainders() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const [reminderDays, setReminderDays] = useState([]);
  const [digestDays, setDigestDays] = useState([]);
  const [reminderTime, setReminderTime] = useState({
    hour: "08",
    minute: "00",
    period: "AM",
  });
  const [digestTime, setDigestTime] = useState({
    hour: "08",
    minute: "00",
    period: "AM",
  });
  const [reminderChannels, setReminderChannels] = useState([]);
  const [digestChannels, setDigestChannels] = useState([]);
  const [notifyLowActivity, setNotifyLowActivity] = useState(true);
  const [notifyTaskAssigned, setNotifyTaskAssigned] = useState(true);
  const [loading, setLoading] = useState(false);
  const [integrations, setIntegrations] = useState(null);

  useEffect(() => {
    apiRequest("/integrations").then(setIntegrations).catch(() => {});
  }, []);

  // SMS / Slack / Push only work once they're set up on the Integrations page
  const channelReady = (ch) => {
    if (ch === "Email" || !integrations) return true;
    if (ch === "SMS") return integrations.server.sms && !!integrations.phone;
    if (ch === "Slack") return integrations.slack_connected;
    if (ch === "Push") return integrations.push_devices > 0;
    return true;
  };
  const channelHint = (ch) =>
    ch === "SMS" && !integrations?.server.sms
      ? "SMS isn't set up on the server yet"
      : `Set up ${ch} on the Integrations page first`;
  useEffect(() => {
    const fetchReminders = async () => {
      try {
        const data = await apiRequest("/email/my-reminders");

        const reminder = data.find((r) => r.type === "reminder");
        const digest = data.find((r) => r.type === "digest");

        if (reminder) {
          const [hour, minute, period] = reminder.time.split(/:| /);
          setReminderTime({ hour, minute, period });
          setReminderDays(reminder.days || []);
          setReminderChannels(reminder.delivery_method || []);
        }

        if (digest) {
          const [hour, minute, period] = digest.time.split(/:| /);
          setDigestTime({ hour, minute, period });
          setDigestDays(digest.days || []);
          setDigestChannels(digest.delivery_method || []);
        }
      } catch (err) {
        console.error("Failed to load reminders:", err);
      }
    };
    fetchReminders();
  }, []);

  const toggleDay = (type, day) => {
    if (type === "reminder") {
      setReminderDays((prev) =>
        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
      );
    } else {
      setDigestDays((prev) =>
        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
      );
    }
  };

  const toggleChannel = (type, channel) => {
    if (type === "reminder") {
      setReminderChannels((prev) =>
        prev.includes(channel)
          ? prev.filter((c) => c !== channel)
          : [...prev, channel],
      );
    } else {
      setDigestChannels((prev) =>
        prev.includes(channel)
          ? prev.filter((c) => c !== channel)
          : [...prev, channel],
      );
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      const formatTime = (t) => `${t.hour}:${t.minute} ${t.period}`;

      const payloads = [
        {
          type: "reminder",
          time: formatTime(reminderTime),
          days: reminderDays,
          delivery_method: reminderChannels,
          is_active: true,
        },
        {
          type: "digest",
          time: formatTime(digestTime),
          days: digestDays,
          delivery_method: digestChannels,
          is_active: true,
        },
      ];

      for (const p of payloads) {
        await apiRequest("/email/set-reminder", "POST", p);
      }

      alert("Reminder and Digest settings saved successfully!");
    } catch (err) {
      console.error("Failed to save reminders:", err);
      alert(" Failed to save settings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="pt-16 min-h-screen bg-gray-50 flex flex-col items-center p-6">
        <div className="w-full max-w-5xl bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-800">Reminders</h1>
            <div className="text-sm text-gray-500">Personal Log ▾</div>
          </div>

          <div className="flex flex-col md:flex-row px-8 py-8 gap-8">
            <div className="md:w-1/3">
              <p className="text-gray-600 text-sm leading-relaxed">
                You can customize when and how you receive reminders or digests.
                Choose the days, time, and preferred channels (Email, SMS,
                Slack, browser push). Set up SMS, Slack and push on the{" "}
                <Link to="/integrations" className="underline text-gray-800">Integrations</Link> page.
              </p>
            </div>
            <div className="md:w-2/3 space-y-6">
              <div className="space-y-2">
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifyLowActivity}
                      onChange={() => setNotifyLowActivity(!notifyLowActivity)}
                    />
                  }
                  label="Continue notifying me even when my account activity is low."
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={notifyTaskAssigned}
                      onChange={() =>
                        setNotifyTaskAssigned(!notifyTaskAssigned)
                      }
                    />
                  }
                  label="Notify me when a new task is assigned to me."
                />
              </div>
              <div className="space-y-3">
                <label className="font-medium text-gray-700 text-sm">
                  Send me reminders on
                </label>
                <div className="flex flex-wrap gap-2">
                  {days.map((d) => (
                    <button
                      key={d}
                      onClick={() => toggleDay("reminder", d)}
                      className={`px-4 py-1.5 rounded-md border text-sm font-medium ${
                        reminderDays.includes(d)
                          ? "bg-red-50 border-red-400 text-red-600"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="font-medium text-gray-700 text-sm block mb-2">
                    Send reminders at
                  </label>
                  <div className="flex gap-2">
                    {["hour", "minute", "period"].map((part) => (
                      <Select
                        key={part}
                        value={reminderTime[part]}
                        onChange={(e) =>
                          setReminderTime({
                            ...reminderTime,
                            [part]: e.target.value,
                          })
                        }
                        size="small"
                      >
                        {part === "hour"
                          ? Array.from({ length: 12 }, (_, i) =>
                              (i + 1).toString().padStart(2, "0"),
                            ).map((h) => (
                              <MenuItem key={h} value={h}>
                                {h}
                              </MenuItem>
                            ))
                          : part === "minute"
                            ? Array.from({ length: 60 }, (_, i) =>
                                i.toString().padStart(2, "0"),
                              ).map((m) => (
                                <MenuItem key={m} value={m}>
                                  {m}
                                </MenuItem>
                              ))
                            : ["AM", "PM"].map((p) => (
                                <MenuItem key={p} value={p}>
                                  {p}
                                </MenuItem>
                              ))}
                      </Select>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-medium text-gray-700 text-sm block mb-2">
                    Send reminders to my
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {CHANNELS.map((ch) => (
                      <button
                        key={ch}
                        disabled={!channelReady(ch) && !reminderChannels.includes(ch)}
                        title={channelReady(ch) ? "" : channelHint(ch)}
                        onClick={() => toggleChannel("reminder", ch)}
                        className={`px-4 py-1.5 rounded-md border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                          reminderChannels.includes(ch)
                            ? "bg-red-50 border-red-400 text-red-600"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <label className="font-medium text-gray-700 text-sm">
                  Send me digests on
                </label>
                <div className="flex flex-wrap gap-2">
                  {days.map((d) => (
                    <button
                      key={d}
                      onClick={() => toggleDay("digest", d)}
                      className={`px-4 py-1.5 rounded-md border text-sm font-medium ${
                        digestDays.includes(d)
                          ? "bg-red-50 border-red-400 text-red-600"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="font-medium text-gray-700 text-sm block mb-2">
                    Send digests at
                  </label>
                  <div className="flex gap-2">
                    {["hour", "minute", "period"].map((part) => (
                      <Select
                        key={part}
                        value={digestTime[part]}
                        onChange={(e) =>
                          setDigestTime({
                            ...digestTime,
                            [part]: e.target.value,
                          })
                        }
                        size="small"
                      >
                        {part === "hour"
                          ? Array.from({ length: 12 }, (_, i) =>
                              (i + 1).toString().padStart(2, "0"),
                            ).map((h) => (
                              <MenuItem key={h} value={h}>
                                {h}
                              </MenuItem>
                            ))
                          : part === "minute"
                            ? Array.from({ length: 60 }, (_, i) =>
                                i.toString().padStart(2, "0"),
                              ).map((m) => (
                                <MenuItem key={m} value={m}>
                                  {m}
                                </MenuItem>
                              ))
                            : ["AM", "PM"].map((p) => (
                                <MenuItem key={p} value={p}>
                                  {p}
                                </MenuItem>
                              ))}
                      </Select>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="font-medium text-gray-700 text-sm block mb-2">
                    Send digests to my
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {CHANNELS.map((ch) => (
                      <button
                        key={ch}
                        disabled={!channelReady(ch) && !digestChannels.includes(ch)}
                        title={channelReady(ch) ? "" : channelHint(ch)}
                        onClick={() => toggleChannel("digest", ch)}
                        className={`px-4 py-1.5 rounded-md border text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                          digestChannels.includes(ch)
                            ? "bg-red-50 border-red-400 text-red-600"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-4">
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleSave}
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
