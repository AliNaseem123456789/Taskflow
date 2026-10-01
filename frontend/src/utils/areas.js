// Every part of the app has its own colour, used by the sidebar and by each
// page's header tile, so colour tells you where you are.
import {
  SquaresFour, Tray, CheckSquareOffset, Kanban, CalendarDots, Timer, Target, MagnifyingGlass, UsersThree,
  Compass, Bell, ChartBar, Plug, UserCircle, Lightbulb, VideoCamera, Megaphone, Pulse, Briefcase, ClipboardText,
  SealCheck, Scales, BookOpenText, AirplaneTilt, Gauge, ChartLine, Buildings, Handshake, IdentificationCard, ListChecks,
  Rocket, UserPlus,
} from "@phosphor-icons/react";

// hue name -> tile classes (defined in index.css so dark mode can retune them)
export const HUES = ["indigo", "amber", "sky", "teal", "violet", "rose"];

export const AREAS = {
  "/dashboard":     { icon: SquaresFour, hue: "indigo", label: "Dashboard" },
  "/inbox":         { icon: Tray, hue: "indigo", label: "Inbox" },
  "/mydones":       { icon: CheckSquareOffset, hue: "indigo", label: "My dones" },
  "/tasks":         { icon: ListChecks, hue: "indigo", label: "Task" },
  "/search":        { icon: MagnifyingGlass, hue: "indigo", label: "Search" },
  "/board":         { icon: Kanban, hue: "amber", label: "Board" },
  "/calendar":      { icon: CalendarDots, hue: "amber", label: "Calendar" },
  "/timesheet":     { icon: Timer, hue: "amber", label: "Timesheet" },
  "/goals":         { icon: Target, hue: "amber", label: "Goals" },
  "/reminders":     { icon: Bell, hue: "amber", label: "Reminders" },
  "/team":          { icon: UsersThree, hue: "sky", label: "Team" },
  "/meetings":      { icon: VideoCamera, hue: "sky", label: "Meetings" },
  "/time-off":      { icon: AirplaneTilt, hue: "sky", label: "Time off" },
  "/workload":      { icon: Gauge, hue: "sky", label: "Workload" },
  "/announcements": { icon: Megaphone, hue: "teal", label: "Announcements" },
  "/updates":       { icon: Pulse, hue: "teal", label: "Project updates" },
  "/decisions":     { icon: Scales, hue: "teal", label: "Decisions" },
  "/wiki":          { icon: BookOpenText, hue: "teal", label: "Wiki" },
  "/reports":       { icon: ChartBar, hue: "teal", label: "Reports" },
  "/analytics":     { icon: ChartLine, hue: "teal", label: "Analytics" },
  "/portfolios":    { icon: Briefcase, hue: "violet", label: "Portfolios" },
  "/forms":         { icon: ClipboardText, hue: "violet", label: "Request forms" },
  "/approvals":     { icon: SealCheck, hue: "violet", label: "Approvals" },
  "/company":       { icon: Buildings, hue: "violet", label: "People & settings" },
  "/companies":     { icon: Buildings, hue: "violet", label: "Company" },
  "/integrations":  { icon: Plug, hue: "violet", label: "Integrations" },
  "/solve":         { icon: Lightbulb, hue: "violet", label: "Solve a problem" },
  "/jobs":          { icon: Handshake, hue: "rose", label: "Job board" },
  "/discover":      { icon: Compass, hue: "rose", label: "Discover" },
  "/profile":       { icon: UserCircle, hue: "rose", label: "Profile" },
  "/profile/public": { icon: IdentificationCard, hue: "rose", label: "Public profile" },
  "/join":          { icon: UserPlus, hue: "sky", label: "Join" },
  "/join-company":  { icon: Rocket, hue: "violet", label: "Join a company" },
};

// The area for a path: the longest matching prefix
export const areaFor = (path) => {
  const p = (path || "").toLowerCase();
  let best = null;
  for (const key of Object.keys(AREAS))
    if ((p === key || p.startsWith(`${key}/`)) && (!best || key.length > best.length)) best = key;
  return best ? AREAS[best] : AREAS["/dashboard"];
};
