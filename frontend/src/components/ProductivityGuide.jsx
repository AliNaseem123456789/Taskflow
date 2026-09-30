import { Link } from "react-router-dom";
import {
  Target,
  Clock,
  Lightbulb,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const tips = [
  {
    icon: Target,
    title: "Set clear goals",
    text: "Break big objectives into daily tasks. Logging them in iDoneThis keeps you accountable and on track.",
  },
  {
    icon: Clock,
    title: "Log at the same time each day",
    text: "Build a habit by logging your dones at the end of each workday. Use email reminders to stay consistent.",
  },
  {
    icon: Lightbulb,
    title: "Reflect on patterns",
    text: "Review your weekly and monthly reports. Spot when you're most productive and double down on what works.",
  },
  {
    icon: BarChart3,
    title: "Celebrate small wins",
    text: "Don't wait for milestones. Acknowledging daily progress builds momentum and prevents burnout.",
  },
];

export default function ProductivityGuide() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="py-20 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Productivity Guide
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mx-auto">
          Simple habits that compound into extraordinary results.
        </p>
      </section>

      {/* Tips */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto space-y-6">
          {tips.map(({ icon: Icon, title, text }, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-lg p-6 flex items-start gap-4"
            >
              <div className="w-9 h-9 bg-gray-100 rounded-md flex items-center justify-center shrink-0">
                <Icon size={18} className="text-gray-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Framework */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
            The Done-Based Framework
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "1", label: "Log", desc: "Write down what you accomplished each day." },
              { step: "2", label: "Review", desc: "Look back weekly to spot trends and patterns." },
              { step: "3", label: "Improve", desc: "Adjust your approach based on real data." },
            ].map(({ step, label, desc }) => (
              <div
                key={step}
                className="bg-white border border-gray-200 rounded-lg p-5 text-center"
              >
                <div className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-3">
                  {step}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{label}</h3>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center bg-white">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Put these tips into practice
        </h2>
        <p className="text-gray-500 mb-6">Start your free trial and see the difference.</p>
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Get started
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}