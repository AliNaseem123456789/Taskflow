import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { Menu } from "lucide-react";
import { isLoggedIn } from "./api/api";
import VerifyEmailBanner from "./components/VerifyEmailBanner";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import { startLive } from "./utils/live";

// Pages that need a login and show the sidebar
const AUTH_ROUTES = [
  "/dashboard",
  "/mydones",
  "/calendar",
  "/reminders",
  "/reports",
  "/search",
  "/team",
  "/profile",
  "/board",
  "/goals",
  "/tasks/",
  "/join",
  "/join-company",
  "/integrations",
  "/company",
  "/companies",
];

const Layout = ({ children }) => {
  const location   = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAppRoute = AUTH_ROUTES.some((r) => location.pathname.toLowerCase().startsWith(r));
  const showSidebar = isLoggedIn() && isAppRoute;

  // open the live-updates connection once we're inside the app
  useEffect(() => {
    if (showSidebar) startLive();
  }, [showSidebar]);

  if (showSidebar) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        {/* Desktop sidebar */}
        <div className="hidden lg:block shrink-0 sticky top-0 h-screen">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/30 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* Main content */}
        <div className="flex-1 min-h-screen flex flex-col min-w-0">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
            >
              <Menu size={20} />
            </button>
            <span className="font-semibold text-gray-900 text-sm">Task Flow</span>
          </div>
          <VerifyEmailBanner />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
        <KeyboardShortcuts />
      </div>
    );
  }

  // Public layout
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
