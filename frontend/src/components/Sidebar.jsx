import { Link, useNavigate, useLocation } from "react-router-dom";
import { SignOut, X } from "@phosphor-icons/react";
import { logout, getStoredUser, getWorkspace } from "../api/api";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import RunningTimer from "./RunningTimer";
import { useAI } from "../utils/ai";
import { AREAS } from "../utils/areas";
import BrandMark from "./ui/BrandMark";

// Navigation in groups; each item takes its icon and colour from utils/areas.js
const MAIN = [
  { items: ["/dashboard", "/inbox", "/mydones", "/search"] },
  { title: "Plan", items: ["/board", "/calendar", "/timesheet", "/goals", "/reminders"] },
  { title: "Together", items: ["/team", "/discover", "/reports"] },
];
// only inside a company workspace
const COMPANY = [
  { title: "Company", items: ["/meetings", "/announcements", "/updates", "/decisions", "/wiki"] },
  { title: "Operations", items: ["/portfolios", "/forms", "/approvals", "/workload", "/time-off", "/analytics"] },
  { title: "People", items: ["/jobs", "/company"] },
];
const FOOTER = ["/integrations", "/profile"];

function NavItem({ path, active, onClick }) {
  const { icon: Icon, hue, label } = AREAS[path];
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-[14px] transition-colors ${
        active ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <span className={`tile tile-${hue} w-7 h-7 rounded-lg ${active ? "is-on" : ""}`}>
        <Icon size={18} weight={active ? "fill" : "duotone"} />
      </span>
      {label}
    </button>
  );
}

export default function Sidebar({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const ai = useAI();

  const go = (path) => {
    navigate(path);
    onClose?.();
  };
  const isActive = (path) => {
    const p = location.pathname.toLowerCase();
    if (path === "/profile") return p === "/profile" || p === "/profile/public";
    return p === path || p.startsWith(`${path}/`);
  };

  const groups = [...MAIN, ...(getWorkspace() ? COMPANY : [])].map((g) =>
    g.title === "Together" && ai.on ? { ...g, items: [...g.items, "/solve"] } : g
  );

  return (
    <div className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Brand */}
      <div className="px-4 h-16 flex items-center justify-between shrink-0">
        <Link to="/dashboard" onClick={() => onClose?.()} aria-label="Task Flow home">
          <BrandMark size={32} />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 lg:hidden" aria-label="Close menu">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <WorkspaceSwitcher onNavigate={onClose} />
      <RunningTimer onNavigate={onClose} />

      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {groups.map((g, i) => (
          <div key={g.title || i} className={i ? "mt-4" : ""}>
            {g.title && <p className="px-2 pb-1.5 text-xs font-semibold text-gray-400">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map((path) => <NavItem key={path} path={path} active={isActive(path)} onClick={() => go(path)} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-100 p-3 space-y-0.5 shrink-0">
        {FOOTER.map((path) => <NavItem key={path} path={path} active={isActive(path)} onClick={() => go(path)} />)}
        <ThemeToggle
          withLabel
          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-[14px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors [&>svg]:mx-1.5"
        />
        <div className="flex items-center gap-3 px-2 pt-2">
          <span className="w-7 h-7 rounded-full btn-accent flex items-center justify-center text-xs font-semibold">
            {(user?.name || user?.email || "?")[0].toUpperCase()}
          </span>
          <p className="flex-1 min-w-0 text-[13px] font-medium text-gray-900 truncate">{user?.name || user?.email || "You"}</p>
          <button onClick={() => logout()} className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100" aria-label="Log out" title="Log out">
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
