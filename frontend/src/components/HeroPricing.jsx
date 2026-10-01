import { Link } from "react-router-dom";
import { Check } from "lucide-react";

const FEATURES = [
  "Task & Journaling",
  "Daily Email Digest",
  "Entry Search",
  "Upload any File Type",
  "Export Historical Tasks",
  "Comments / Likes / Shares",
  "End-to-end encryption",
  "Multi-language support",
  "Groups / Categories / Tags",
  "Team Set-up",
  "Productivity Reporting",
  "User Roles & Permissions",
  "Integrations",
  "24/7 Support",
];

export default function HeroPricing() {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Everything included. Free to start.
          </h2>
          <p className="text-sm text-gray-500">
            14-day trial, no credit card required.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-8">
          <div className="grid grid-cols-2 gap-3 mb-8">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Check size={14} className="text-gray-400 shrink-0" strokeWidth={2.5} />
                <span className="text-sm text-gray-700">{f}</span>
              </div>
            ))}
          </div>

          <Link
            to="/signup"
            className="block w-full text-center btn-accent py-3 rounded-md text-sm font-semibold transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </section>
  );
}