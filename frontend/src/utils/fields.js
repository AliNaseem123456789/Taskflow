// Custom project fields: types, how a value reads, and the people of a company (for "person" fields).
import { createContext, useEffect, useState } from "react";
import { apiRequest } from "./api";

export const FIELD_KINDS = [
  ["text", "Text"], ["number", "Number"], ["select", "Dropdown"], ["date", "Date"], ["person", "Person"], ["checkbox", "Checkbox"],
];

// The project's fields + people, for board cards deep in the tree
export const FieldsContext = createContext({ fields: [], people: {} });

// a value as short text ("" when empty)
export const fieldText = (field, value, people = {}) => {
  if (value === null || value === undefined || value === "") return "";
  if (field.kind === "checkbox") return value ? field.name : "";
  if (field.kind === "person") return people[value]?.name || people[value]?.email || "Someone";
  if (field.kind === "date") return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
  return String(value);
};

const cache = {};
// active members of a company as { [userId]: { id, name, email } } plus a list
export function useMembersOf(companyId) {
  const [list, setList] = useState(cache[companyId] || []);
  useEffect(() => {
    if (!companyId || cache[companyId]) return;
    apiRequest(`/companies/${companyId}/members`, "GET", null, { company: companyId })
      .then((m) => {
        cache[companyId] = (m || []).filter((x) => x.status === "active");
        setList(cache[companyId]);
      })
      .catch(() => {});
  }, [companyId]);
  return { list, byId: Object.fromEntries(list.map((m) => [m.id, m])) };
}
