// Pages anyone can open without logging in (public profiles, company pages, public roles).
// Plain fetch: no login token, no workspace header.
import { BASE_URL } from "../api/api";

export async function publicGet(path) {
  const res = await fetch(`${BASE_URL}/public${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Not found");
    err.status = res.status;
    throw err;
  }
  return body;
}

export const GENRE_LABELS = {
  software: "Software", data: "Data", design: "Design", product: "Product", marketing: "Marketing", sales: "Sales",
  support: "Support", operations: "Operations", writing: "Writing", education: "Education", research: "Research",
  finance: "Finance", hr: "People & HR", legal: "Legal", agency: "Agency / client work", "field work": "Field work", other: "Other",
};
export const KIND_LABELS = { full_time: "Full-time", part_time: "Part-time", project: "Projects", gig: "Short gigs" };
