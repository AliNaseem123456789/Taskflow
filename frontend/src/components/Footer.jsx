import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-16 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
        <div>
          <h4 className="text-[13px] font-semibold text-gray-900 mb-4">Product</h4>
          <ul className="space-y-2.5">
            {[
              ["/how-it-works", "How it Works"],
              ["/pricing", "Pricing"],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[13px] font-semibold text-gray-900 mb-4">Resources</h4>
          <ul className="space-y-2.5">
            {[
              ["/productivity-guide", "Guides"],
              ["/case-studies", "Case Studies"],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[13px] font-semibold text-gray-900 mb-4">Company</h4>
          <ul className="space-y-2.5">
            {[
              ["/privacy-policy", "Privacy"],
              ["/terms-of-service", "Terms"],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to} className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="mailto:help@idonethis.com"
                className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
              >
                help@idonethis.com
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-[13px] font-semibold text-gray-900 mb-4">Newsletter</h4>
          <form className="space-y-2" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="you@email.com"
              className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="w-full btn-accent text-[13px] font-medium py-2 rounded-md transition-colors"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-gray-100">
        <p className="text-[12px] text-gray-400">
          &copy; {new Date().getFullYear()} Task Flow. All rights reserved.
        </p>
      </div>
    </footer>
  );
}