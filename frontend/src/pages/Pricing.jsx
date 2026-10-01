import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "For individuals getting started.",
    features: [
      "Up to 50 entries/month",
      "Daily email reminders",
      "Calendar view",
      "7-day history",
    ],
    cta: "Get started",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    desc: "For professionals who want the full picture.",
    features: [
      "Unlimited entries",
      "Daily email digest",
      "AI-powered reports",
      "Full search history",
      "Export to CSV",
      "Priority support",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$29",
    period: "/month",
    desc: "For teams that want shared visibility.",
    features: [
      "Everything in Pro",
      "Up to 20 members",
      "Team dashboard",
      "Manager insights",
      "Roles & permissions",
      "Integrations",
      "Dedicated support",
    ],
    cta: "Contact sales",
    href: "/signup",
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="py-20 px-6 text-center">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-500 max-w-md mx-auto">
          Start free. Upgrade when you need more.
        </p>
      </section>

      {/* Cards */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-lg border p-6 flex flex-col ${
                plan.highlighted
                  ? "border-indigo-600 ring-1 ring-indigo-500"
                  : "border-gray-200"
              }`}
            >
              {plan.highlighted && (
                <span className="text-[11px] font-semibold text-gray-900 mb-4">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <div className="mt-2 mb-1">
                <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-sm text-gray-500 ml-1">{plan.period}</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">{plan.desc}</p>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check size={14} className="text-gray-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to={plan.href}
                className={`block w-full text-center py-2.5 rounded-md text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? "btn-accent "
                    : "border border-gray-200 text-gray-900 hover:bg-gray-50"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-8 text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "Can I try before I buy?",
                a: "Yes — the Free plan has no time limit, and the Pro plan includes a 14-day free trial with no credit card required.",
              },
              {
                q: "How does billing work?",
                a: "Pro and Team plans are billed monthly. You can cancel anytime from your account settings.",
              },
              {
                q: "Can I switch plans later?",
                a: "Absolutely. Upgrade or downgrade at any time. Changes take effect on your next billing cycle.",
              },
              {
                q: "Is my data secure?",
                a: "All data is encrypted at rest and in transit. We use industry-standard security practices and never share your data.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{q}</h3>
                <p className="text-sm text-gray-500">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center bg-white">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Start tracking today</h2>
        <p className="text-gray-500 mb-6">No credit card required.</p>
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 btn-accent px-6 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          Get started free
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}