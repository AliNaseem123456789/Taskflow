import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Calendar, GitPullRequest, MessageSquare, Smartphone, Ticket, RefreshCw, Check, AlertCircle } from "lucide-react";
import { apiRequest } from "../utils/api";
import { pushSupported, isPushOn, enablePush, disablePush } from "../utils/push";
import AreaTile from "../components/AreaTile";

const inputCls = "w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900";
const btn = "px-3 py-1.5 text-sm rounded-md disabled:opacity-50";
const primary = `${btn} btn-accent `;
const secondary = `${btn} border border-gray-200 text-gray-700 hover:bg-gray-50`;

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");

function Card({ icon: Icon, title, subtitle, status, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[17px] font-bold text-gray-900">{title}</h2>
            {status}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

const Connected = () => (
  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
    <Check size={11} /> Connected
  </span>
);
const NotSetUp = () => (
  <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Not set up on the server</span>
);

// Shows the result of the last action under a card
function Result({ value }) {
  if (!value) return null;
  const isError = value.startsWith("!");
  return (
    <p className={`flex items-center gap-1 text-xs mt-3 ${isError ? "text-red-600" : "text-emerald-600"}`}>
      {isError && <AlertCircle size={12} />}
      {isError ? value.slice(1) : value}
    </p>
  );
}

export default function IntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");
  const [phone, setPhone] = useState("");
  const [slack, setSlack] = useState("");
  const [github, setGithub] = useState("");
  const [jira, setJira] = useState({ site: "", email: "", token: "" });
  const [pushOn, setPushOn] = useState(false);

  const load = () =>
    apiRequest("/integrations").then((d) => {
      setInfo(d);
      setPhone(d.phone);
    });

  useEffect(() => {
    load().catch(() => {});
    isPushOn().then(setPushOn);
    const g = params.get("google");
    if (g) {
      setMsg({ google: g === "connected" ? "Google Calendar connected" : "!Google didn't finish connecting. Try again." });
      setParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // run an action, show its result under card `key`
  const act = async (key, fn, success) => {
    setBusy(key);
    setMsg((m) => ({ ...m, [key]: "" }));
    try {
      const out = await fn();
      setMsg((m) => ({ ...m, [key]: typeof success === "function" ? success(out) : success }));
      await load();
    } catch (err) {
      setMsg((m) => ({ ...m, [key]: `!${err.message}` }));
    } finally {
      setBusy("");
    }
  };
  const test = (channel) => act(channel, () => apiRequest("/integrations/test", "POST", { channel }), "Test sent — check it arrived");

  if (!info)
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title"><AreaTile />Integrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Where reminders reach you, and tools that log your work automatically.
        </p>
      </div>

      <div className="space-y-4">
        {/* Browser push */}
        <Card icon={Bell} title="Browser notifications" subtitle="Mentions, comments and reminders pop up on this device."
          status={pushOn && <Connected />}>
          {!pushSupported() ? (
            <p className="text-xs text-gray-500">This browser doesn't support notifications.</p>
          ) : (
            <div className="flex gap-2">
              {pushOn ? (
                <>
                  <button className={secondary} disabled={busy === "push"} onClick={() => test("push")}>Send test</button>
                  <button className={secondary} disabled={busy === "push"}
                    onClick={() => act("push", async () => { await disablePush(); setPushOn(false); }, "Turned off on this device")}>
                    Turn off
                  </button>
                </>
              ) : (
                <button className={primary} disabled={busy === "push"}
                  onClick={() => act("push", async () => { await enablePush(); setPushOn(true); }, "Turned on for this device")}>
                  Enable on this device
                </button>
              )}
            </div>
          )}
          <Result value={msg.push} />
        </Card>

        {/* SMS */}
        <Card icon={Smartphone} title="SMS" subtitle="Get reminders by text message."
          status={!info.server.sms ? <NotSetUp /> : info.phone && <Connected />}>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="+923001234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className={primary} disabled={busy === "sms"}
              onClick={() => act("sms", () => apiRequest("/integrations/contact", "PUT", { phone }), phone ? "Phone number saved" : "Phone number removed")}>
              Save
            </button>
            {info.phone && info.server.sms && (
              <button className={secondary} disabled={busy === "sms"} onClick={() => test("sms")}>Test</button>
            )}
          </div>
          {!info.server.sms && (
            <p className="text-xs text-gray-400 mt-2">Texts start working once the Twilio keys are added to the server's .env.</p>
          )}
          <Result value={msg.sms} />
        </Card>

        {/* Slack */}
        <Card icon={MessageSquare} title="Slack" subtitle="Reminders as Slack messages, via an Incoming Webhook."
          status={info.slack_connected && <Connected />}>
          <div className="flex gap-2">
            <input className={inputCls} placeholder={info.slack_connected ? "Paste a new webhook to replace it" : "https://hooks.slack.com/services/..."}
              value={slack} onChange={(e) => setSlack(e.target.value)} />
            <button className={primary} disabled={busy === "slack" || !slack}
              onClick={() => act("slack", async () => { await apiRequest("/integrations/contact", "PUT", { slack_webhook: slack }); setSlack(""); }, "Slack webhook saved")}>
              Save
            </button>
          </div>
          {info.slack_connected && (
            <div className="flex gap-2 mt-2">
              <button className={secondary} disabled={busy === "slack"} onClick={() => test("slack")}>Send test</button>
              <button className={secondary} disabled={busy === "slack"}
                onClick={() => act("slack", () => apiRequest("/integrations/contact", "PUT", { slack_webhook: "" }), "Slack removed")}>
                Remove
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            In Slack: Apps → search "Incoming Webhooks" → Add to Slack → pick a channel or yourself → copy the URL.
          </p>
          <Result value={msg.slack} />
        </Card>

        {/* Google Calendar */}
        <Card icon={Calendar} title="Google Calendar" subtitle="Tasks with a due date appear as all-day events."
          status={!info.server.google ? <NotSetUp /> : info.google.connected && <Connected />}>
          {info.google.connected ? (
            <>
              <p className="text-xs text-gray-500 mb-3">Last synced: {when(info.google.last_synced_at)}</p>
              {info.google.last_error && <p className="text-xs text-red-600 mb-3">Last error: {info.google.last_error}</p>}
              <div className="flex gap-2">
                <button className={secondary} disabled={busy === "google"}
                  onClick={() => act("google", () => apiRequest("/integrations/google/sync", "POST"), (r) => `Synced ${r.synced} task(s)`)}>
                  <RefreshCw size={12} className="inline mr-1" /> Sync now
                </button>
                <button className={secondary} disabled={busy === "google"}
                  onClick={() => act("google", () => apiRequest("/integrations/google", "DELETE"), "Disconnected (existing events stay)")}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <button className={primary} disabled={!info.server.google || busy === "google"}
              onClick={() => act("google", async () => {
                const { url } = await apiRequest("/integrations/google/connect");
                window.location.href = url;
              }, "Opening Google…")}>
              Connect Google Calendar
            </button>
          )}
          <Result value={msg.google} />
        </Card>

        {/* GitHub */}
        <Card icon={GitPullRequest} title="GitHub" subtitle="Merged PRs and closed issues become Done tasks (last 14 days, every 3 hours)."
          status={info.github.connected && <Connected />}>
          {info.github.connected ? (
            <>
              <p className="text-xs text-gray-500 mb-3">
                @{info.github.username} · last synced {when(info.github.last_synced_at)}
              </p>
              {info.github.last_error && <p className="text-xs text-red-600 mb-3">Last error: {info.github.last_error}</p>}
              <div className="flex gap-2">
                <button className={secondary} disabled={busy === "github"}
                  onClick={() => act("github", () => apiRequest("/integrations/github/sync", "POST"), (r) => `Found ${r.found}, added ${r.added} new task(s)`)}>
                  <RefreshCw size={12} className="inline mr-1" /> Sync now
                </button>
                <button className={secondary} disabled={busy === "github"}
                  onClick={() => act("github", () => apiRequest("/integrations/github", "DELETE"), "Disconnected (imported tasks stay)")}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input className={inputCls} type="password" placeholder="Personal access token (ghp_... or github_pat_...)"
                  value={github} onChange={(e) => setGithub(e.target.value)} />
                <button className={primary} disabled={busy === "github" || !github}
                  onClick={() => act("github", async () => { const r = await apiRequest("/integrations/github", "PUT", { token: github }); setGithub(""); return r; }, (r) => `Connected as @${r.username}`)}>
                  Connect
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token with read access to
                Issues, Pull requests and Metadata for your repos.
              </p>
            </>
          )}
          <Result value={msg.github} />
        </Card>

        {/* Jira */}
        <Card icon={Ticket} title="Jira" subtitle="Your resolved Jira issues become Done tasks (last 14 days, every 3 hours)."
          status={info.jira.connected && <Connected />}>
          {info.jira.connected ? (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {info.jira.site} · {info.jira.email} · last synced {when(info.jira.last_synced_at)}
              </p>
              {info.jira.last_error && <p className="text-xs text-red-600 mb-3">Last error: {info.jira.last_error}</p>}
              <div className="flex gap-2">
                <button className={secondary} disabled={busy === "jira"}
                  onClick={() => act("jira", () => apiRequest("/integrations/jira/sync", "POST"), (r) => `Found ${r.found}, added ${r.added} new task(s)`)}>
                  <RefreshCw size={12} className="inline mr-1" /> Sync now
                </button>
                <button className={secondary} disabled={busy === "jira"}
                  onClick={() => act("jira", () => apiRequest("/integrations/jira", "DELETE"), "Disconnected (imported tasks stay)")}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-2">
                <input className={inputCls} placeholder="yourteam.atlassian.net" value={jira.site} onChange={(e) => setJira({ ...jira, site: e.target.value })} />
                <input className={inputCls} placeholder="you@company.com" value={jira.email} onChange={(e) => setJira({ ...jira, email: e.target.value })} />
                <input className={inputCls} type="password" placeholder="API token" value={jira.token} onChange={(e) => setJira({ ...jira, token: e.target.value })} />
              </div>
              <button className={`${primary} mt-2`} disabled={busy === "jira" || !jira.site || !jira.email || !jira.token}
                onClick={() => act("jira", async () => { const r = await apiRequest("/integrations/jira", "PUT", jira); setJira({ site: "", email: "", token: "" }); return r; }, (r) => `Connected to ${r.site}`)}>
                Connect
              </button>
              <p className="text-xs text-gray-400 mt-2">Create a token at id.atlassian.com → Security → API tokens.</p>
            </>
          )}
          <Result value={msg.jira} />
        </Card>
      </div>
    </div>
  );
}
