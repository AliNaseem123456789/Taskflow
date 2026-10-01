import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Calendar, BarChart3 } from "lucide-react";

export default function Hero() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600 mb-6">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
          Free 14-day trial &mdash; no credit card
        </div>

        <h1 className="font-display text-4xl md:text-6xl font-bold text-gray-900 leading-tight tracking-tight mb-5">
          Track what you've done,
          <br />
          <span className="text-gray-400">not just what's left.</span>
        </h1>

        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8 leading-relaxed">
          A simple daily log for individuals and teams. Journal your tasks, measure
          progress, and build momentum — one done at a time.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 btn-accent px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            Get started free
            <ArrowRight size={16} />
          </Link>
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-5 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            See how it works
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-14">
          {[
            [CheckCircle, "Daily task logging"],
            [Calendar, "Calendar overview"],
            [BarChart3, "AI-powered reports"],
          ].map(([Icon, label]) => (
            <div
              key={label}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
            >
              <Icon size={16} className="text-gray-400" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}