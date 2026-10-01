import { Link } from "react-router-dom";
import { isLoggedIn } from "../api/api";
import BrandMark from "./ui/BrandMark";

// Frame for pages anyone can open: a slim top bar and a centered column
export default function PublicShell({ children }) {
  const inApp = isLoggedIn();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BrandMark size={28} />
          </Link>
          {inApp ? (
            <div className="flex items-center gap-4 text-sm">
              <Link to="/discover" className="text-gray-600 hover:text-gray-900">Discover</Link>
              <Link to="/dashboard" className="px-3 py-1.5 btn-accent rounded-md">Open app</Link>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link to="/login" className="text-gray-600 hover:text-gray-900">Log in</Link>
              <Link to="/signup" className="px-3 py-1.5 btn-accent rounded-md">Sign up</Link>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
