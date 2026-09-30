import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { caseStudies } from "../data/case-studies";

export default function SuccessStories() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="py-20 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Success Stories
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mx-auto">
          See how teams use iDoneThis to stay productive and aligned.
        </p>
      </section>

      {/* Case studies */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto space-y-6">
          {caseStudies.map((cs, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start gap-4">
                {cs.logo && (
                  <img
                    src={cs.logo}
                    alt={cs.company}
                    className="w-10 h-10 rounded-md object-contain border border-gray-100 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">
                    {cs.company}
                  </h2>
                  {cs.industry && (
                    <span className="text-xs text-gray-400 uppercase tracking-wider">
                      {cs.industry}
                    </span>
                  )}
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                    {cs.summary || cs.description}
                  </p>
                  {cs.quote && (
                    <blockquote className="mt-3 pl-3 border-l-2 border-gray-200 text-sm text-gray-600 italic">
                      &ldquo;{cs.quote}&rdquo;
                      {cs.author && (
                        <span className="block mt-1 text-xs text-gray-400 not-italic">
                          — {cs.author}
                        </span>
                      )}
                    </blockquote>
                  )}
                  {cs.results && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {cs.results.map((r, j) => (
                        <span
                          key={j}
                          className="text-xs bg-gray-50 border border-gray-100 rounded-md px-2.5 py-1 text-gray-600"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Ready to write your own success story?
        </h2>
        <p className="text-gray-500 mb-6">Join thousands of productive teams.</p>
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Start free trial
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}