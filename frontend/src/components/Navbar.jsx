import { Link } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import BrandMark from "./ui/BrandMark";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark size={28} />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link
            to="/how-it-works"
            className="text-[13px] text-gray-500 font-medium hover:text-gray-900 transition-colors"
          >
            How it works
          </Link>
          <Link
            to="/pricing"
            className="text-[13px] text-gray-500 font-medium hover:text-gray-900 transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/case-studies"
            className="text-[13px] text-gray-500 font-medium hover:text-gray-900 transition-colors"
          >
            Case Studies
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100" />
          <Link
            to="/login"
            className="text-[13px] text-gray-600 font-medium hover:text-gray-900 transition-colors"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="btn-accent px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}