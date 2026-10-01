// utils/workTypes.js
// Kinds of work. Each is a preset of project columns; category decides how a
// column counts in reports (todo / in_progress / done). Adding a kind of work
// = adding an entry here.
const s = (name, category, color) => ({ name, category, color });

export const WORK_TYPES = {
  general: {
    label: "General",
    statuses: [s("To do", "todo", "#6b7280"), s("Doing", "in_progress", "#f59e0b"), s("Done", "done", "#22c55e")],
  },
  software: {
    label: "Software",
    statuses: [
      s("Backlog", "todo", "#9ca3af"), s("To do", "todo", "#6b7280"), s("In progress", "in_progress", "#f59e0b"),
      s("In review", "in_progress", "#a855f7"), s("Done", "done", "#22c55e"),
    ],
  },
  agency: {
    label: "Agency / client work",
    statuses: [
      s("Brief", "todo", "#6b7280"), s("In progress", "in_progress", "#f59e0b"),
      s("Client review", "in_progress", "#a855f7"), s("Delivered", "done", "#22c55e"),
    ],
  },
  marketing: {
    label: "Marketing",
    statuses: [
      s("Idea", "todo", "#9ca3af"), s("Drafting", "in_progress", "#f59e0b"), s("Approval", "in_progress", "#a855f7"),
      s("Scheduled", "in_progress", "#3b82f6"), s("Published", "done", "#22c55e"),
    ],
  },
  operations: {
    label: "Operations / support",
    statuses: [
      s("New", "todo", "#6b7280"), s("Triaged", "todo", "#3b82f6"), s("Working", "in_progress", "#f59e0b"),
      s("Waiting", "in_progress", "#a855f7"), s("Resolved", "done", "#22c55e"),
    ],
  },
  education: {
    label: "Education",
    statuses: [s("Assigned", "todo", "#6b7280"), s("Submitted", "in_progress", "#f59e0b"), s("Graded", "done", "#22c55e")],
  },
  field: {
    label: "Field work",
    statuses: [
      s("Planned", "todo", "#6b7280"), s("On site", "in_progress", "#f59e0b"),
      s("Inspection", "in_progress", "#a855f7"), s("Complete", "done", "#22c55e"),
    ],
  },
  research: {
    label: "Research",
    statuses: [
      s("Hypothesis", "todo", "#6b7280"), s("Running", "in_progress", "#f59e0b"),
      s("Analysing", "in_progress", "#a855f7"), s("Concluded", "done", "#22c55e"),
    ],
  },
};

// Old Done/Doing/Delayed status that matches a column category
export const legacyStatus = (category) => (category === "done" ? "Done" : "Doing");
