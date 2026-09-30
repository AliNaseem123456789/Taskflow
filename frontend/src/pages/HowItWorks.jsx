import { Link } from "react-router-dom";
import {
  BookOpen,
  Bell,
  TrendingUp,
  Search,
  Calendar,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import benefit1 from "../assets/IncreaseProductivity.avif";
import benefit2 from "../assets/ImproveEngagements.avif";
import benefit3 from "../assets/ReduceMeetings.avif";
import Video1 from "../assets/video.mp4";

const features = [
  { icon: BookOpen, title: "Journal Log", desc: "Log and measure your tasks daily to achieve your goals." },
  { icon: Bell, title: "Daily Reminders", desc: "Never forget to log accomplishments with automatic prompts." },
  { icon: TrendingUp, title: "Progress Tracking", desc: "Look back on your achievements and see how far you've come." },
  { icon: Search, title: "Searchable History", desc: "Use natural language to understand your productivity patterns." },
  { icon: Calendar, title: "Calendar View", desc: "At-a-glance view across any timeframe." },
  { icon: Sparkles, title: "AI Reports", desc: "Summarize historical tasks to find insights." },
];

export default function HowItWorks() {
  return (
    <div className="pt-14">
      {/* Hero */}
      <section className="py-20 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">How it Works</h1>
        <p className="text-lg text-gray-500 max-w-lg mx-auto">
          The simple way to reflect on your day and stay motivated.
        </p>
      </section>

      {/* Video */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto">
          <video
            src={Video1}
            controls
            className="w-full rounded-lg border border-gray-200"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto space-y-24">
          {[
            { img: benefit1, title: "Increase Productivity", text: "Document daily achievements and goals, fostering accountability with daily email reminders of completed tasks." },
            { img: benefit2, title: "Improve Engagement", text: "Like and comment on done reports. Managers get valuable insights to gauge team sentiment.", reverse: true },
            { img: benefit3, title: "Reduce Meetings", text: "Record progress and goals so others can catch up at their convenience." },
          ].map(({ img, title, text, reverse }, i) => (
            <div
              key={i}
              className={`grid md:grid-cols-2 gap-12 items-center ${reverse ? "md:direction-rtl" : ""}`}
            >
              <img
                src={img}
                alt={title}
                className={`w-full rounded-lg border border-gray-200 ${reverse ? "md:order-2" : ""}`}
              />
              <div className={reverse ? "md:order-1" : ""}>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">{title}</h2>
                <p className="text-gray-500 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
              >
                <div className="w-9 h-9 bg-gray-100 rounded-md flex items-center justify-center mb-4">
                  <Icon size={18} className="text-gray-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 text-center bg-white">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Ready to get started?</h2>
        <p className="text-gray-500 mb-6">Track your progress, celebrate your wins.</p>
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