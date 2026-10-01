// People and teams of the chosen company, for "Team" / "Assign to" pickers.
// Empty in Personal. Cached per page load (switching workspace reloads).
import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { getWorkspace } from "../api/api";

let cache = null;

export function useCompanyPeople() {
  const companyId = getWorkspace();
  const [data, setData] = useState(cache || { members: [], teams: [] });
  useEffect(() => {
    if (!companyId || cache) return;
    Promise.all([
      apiRequest(`/companies/${companyId}/members`).catch(() => []), // guests get 403 -> []
      apiRequest("/teams").catch(() => []),
    ]).then(([members, teams]) => {
      cache = {
        members: members.filter((m) => m.status === "active" && m.role !== "viewer"),
        teams,
      };
      setData(cache);
    });
  }, [companyId]);
  return { inCompany: !!companyId, ...data };
}
