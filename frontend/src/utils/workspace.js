// The companies I'm in + the one chosen in the sidebar switcher.
import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { getWorkspace, setWorkspace } from "../api/api";

let cache = null;
const listeners = new Set();

export const loadCompanies = async (force = false) => {
  if (cache && !force) return cache;
  cache = await apiRequest("/companies").catch(() => []);
  // chosen company no longer mine -> back to Personal
  const ws = getWorkspace();
  if (ws && !cache.some((c) => c.id === ws)) setWorkspace("");
  listeners.forEach((fn) => fn(cache));
  return cache;
};

// { companies, current } — current = the chosen company (with my role) or null for Personal
export function useWorkspace() {
  const [companies, setCompanies] = useState(cache || []);
  useEffect(() => {
    listeners.add(setCompanies);
    loadCompanies().then(setCompanies);
    return () => listeners.delete(setCompanies);
  }, []);
  const id = getWorkspace();
  const current = companies.find((c) => c.id === id) || null;
  return { companies, current, refresh: () => loadCompanies(true) };
}

export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  guest: "Guest",
  viewer: "Viewer",
};

export const isCompanyAdmin = (company) => ["owner", "admin"].includes(company?.role);
