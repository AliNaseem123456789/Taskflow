// Kinds of meeting, shared by the meetings list and a meeting's page
export const MEETING_KINDS = [
  ["meeting", "Meeting"],
  ["one_on_one", "1:1"],
  ["standup", "Standup"],
  ["retro", "Retro"],
  ["review", "Review / demo"],
];
export const kindLabel = (k) => MEETING_KINDS.find(([v]) => v === k)?.[1] || "Meeting";
