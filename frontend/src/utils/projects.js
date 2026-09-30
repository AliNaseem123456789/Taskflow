// Projects from all my teams, for the "Project" dropdown on tasks.
import { useEffect, useState } from "react";
import { apiRequest } from "./api";

let cache = null;

export function useMyProjects() {
  const [projects, setProjects] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    apiRequest("/teams/projects/mine")
      .then((p) => {
        cache = p;
        setProjects(p);
      })
      .catch(() => {});
  }, []);
  return projects;
}

// forget the cache (e.g. after creating a project)
export const refreshMyProjects = () => {
  cache = null;
};
