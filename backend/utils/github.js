// utils/github.js — merged PRs and closed issues for a user (personal access token)
const API = "https://api.github.com";

const gh = async (token, path) => {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "taskflow",
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("GitHub rejected the token (expired or revoked?)");
  if (!res.ok) throw new Error(data.message || `GitHub error ${res.status}`);
  return data;
};

// Checks the token and returns the GitHub username
export const githubUser = async (token) => (await gh(token, "/user")).login;

// [{ external_id, url, title, doneAt }] since the given date (YYYY-MM-DD)
export const githubCompleted = async (token, username, since) => {
  const search = (q) => gh(token, `/search/issues?per_page=50&q=${encodeURIComponent(q)}`);
  const [prs, issues] = await Promise.all([
    search(`is:pr author:${username} is:merged merged:>=${since}`),
    search(`is:issue assignee:${username} is:closed reason:completed closed:>=${since}`),
  ]);
  const repoOf = (item) => item.repository_url.split("/repos/")[1]; // owner/repo
  return [
    ...prs.items.map((pr) => ({
      external_id: `github:pr:${repoOf(pr)}#${pr.number}`,
      url: pr.html_url,
      title: `Merged PR ${repoOf(pr)}#${pr.number}: ${pr.title}`,
      doneAt: pr.pull_request?.merged_at || pr.closed_at,
    })),
    ...issues.items.map((issue) => ({
      external_id: `github:issue:${repoOf(issue)}#${issue.number}`,
      url: issue.html_url,
      title: `Closed issue ${repoOf(issue)}#${issue.number}: ${issue.title}`,
      doneAt: issue.closed_at,
    })),
  ];
};
