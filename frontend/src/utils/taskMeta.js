// Labels and colours shared by task lists, the board and search.
export const STATUSES = ["Doing", "Delayed", "Done"];

export const STATUS_BADGE = {
  Done: "bg-emerald-50 text-emerald-700",
  Doing: "bg-amber-50 text-amber-700",
  Delayed: "bg-rose-50 text-rose-700",
};

export const PRIORITIES = [
  { value: "low", label: "Low", badge: "bg-gray-100 text-gray-600" },
  { value: "medium", label: "Medium", badge: "bg-gray-100 text-gray-600" },
  { value: "high", label: "High", badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20" },
  { value: "urgent", label: "Urgent", badge: "bg-rose-600 text-white" },
];
export const priorityInfo = (value) => PRIORITIES.find((p) => p.value === value) || PRIORITIES[1];

export const RECURRENCES = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];
export const recurrenceLabel = (value) => RECURRENCES.find((r) => r.value === (value || ""))?.label;
