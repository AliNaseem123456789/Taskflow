// utils/jira.js — resolved Jira issues for a user (Atlassian API token)

// "yourteam.atlassian.net" / "https://yourteam.atlassian.net/jira" -> "https://yourteam.atlassian.net"
export const normaliseSite = (site) => {
  try {
    const url = new URL(/^https?:\/\//.test(site) ? site : `https://${site}`);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

const jira = async ({ site, email, token }, path) => {
  const res = await fetch(`${site}${path}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${email}:${token}`).toString("base64"),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error("Jira rejected the email/token");
  if (!res.ok) throw new Error(data.errorMessages?.[0] || `Jira error ${res.status}`);
  return data;
};

// Checks the credentials, returns the Jira display name
export const jiraUser = async (creds) => (await jira(creds, "/rest/api/3/myself")).displayName;

// [{ external_id, url, title, doneAt }] resolved by / assigned to me since the date
export const jiraCompleted = async (creds, since) => {
  const jql = `assignee = currentUser() AND statusCategory = Done AND resolved >= "${since}" ORDER BY resolved DESC`;
  const data = await jira(
    creds,
    `/rest/api/3/search/jql?maxResults=50&fields=summary,resolutiondate&jql=${encodeURIComponent(jql)}`
  );
  return (data.issues || []).map((issue) => ({
    external_id: `jira:${issue.key}`,
    url: `${creds.site}/browse/${issue.key}`,
    title: `${issue.key}: ${issue.fields.summary}`,
    doneAt: issue.fields.resolutiondate,
  }));
};
