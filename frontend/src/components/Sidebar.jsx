import { useNavigate, useLocation } from "react-router-dom";
import { logout, getStoredUser } from "../api/api";
import ThemeToggle from "./ThemeToggle";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Bell,
  BarChart3,
  LogOut,
  UserCircle,
  User,
  X,
  Users,
  Search,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",  path: "/dashboard" },
  { icon: CheckSquare,     label: "My Dones",   path: "/mydones"   },
  { icon: Calendar,        label: "Calendar",   path: "/calendar"  },
  { icon: Search,          label: "Search",     path: "/search"    },
  { icon: Users,           label: "Team",       path: "/team"      },
  { icon: Bell,            label: "Reminders",  path: "/reminders" },
  { icon: BarChart3,       label: "Reports",    path: "/reports"   },
  { icon: UserCircle,      label: "Profile",    path: "/profile"   },
];

export default function Sidebar({ onClose }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const user = getStoredUser();

  const handleLogout = () => logout();

  const handleNav = (path) => {
    navigate(path);
    onClose?.();
  };

  return (
    <div className="w-60 h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-5 h-14 flex items-center justify-between border-b border-gray-100 shrink-0">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => handleNav("/dashboard")}
        >
          <div className="w-5 h-5 bg-gray-900 rounded" />
          <span className="font-semibold text-gray-900 text-[15px]">Task Flow</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ icon: Icon, label, path }) => {
          const active = location.pathname === path ||
            (path === "/team" && location.pathname.startsWith("/team"));
          return (
            <button
              key={path}
              onClick={() => handleNav(path)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                active
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.5} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-100 p-3 space-y-1 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
            <User size={14} className="text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-900 truncate">
              {user?.name || user?.email || "User"}
            </p>
          </div>
        </div>
        <ThemeToggle
          withLabel
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <LogOut size={16} strokeWidth={1.5} />
          Log out
        </button>
      </div>
    </div>
  );
}
