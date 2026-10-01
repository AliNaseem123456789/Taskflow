const reviews = [
  { name: "Sarah J.", text: "Completely changed how our engineering team handles standups. No more chasing people for updates." },
  { name: "Marcus C.", text: "Helps me document the small wins that usually get forgotten by the end of the week." },
  { name: "Elena R.", text: "The email integration is the killer feature. I just reply to the prompt and my day is logged." },
  { name: "David K.", text: "Finally, a productivity tool that doesn't feel like a chore. The best motivation I've found." },
  { name: "Priya S.", text: "We use it for cross-departmental transparency without sitting in on internal meetings." },
  { name: "Tom W.", text: "It's like a fitness tracker for my career. I can see exactly when I hit my stride." },
  { name: "Jessica L.", text: "The interface is so clean. It does one thing — tracking progress — perfectly." },
  { name: "Sam B.", text: "Great for remote teams. It builds shared momentum even when we're thousands of miles apart." },
  { name: "Amara O.", text: "Makes writing my end-of-year self-appraisal a 5-minute task instead of a 5-hour headache." },
];

export default function Reviews() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Loved by teams everywhere
          </h2>
          <p className="text-sm text-gray-500">
            Join thousands of productive professionals.
          </p>
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
          {reviews.map((r, i) => (
            <div
              key={i}
              className="break-inside-avoid bg-white border border-gray-200 rounded-xl p-5"
            >
              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                &ldquo;{r.text}&rdquo;
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-semibold text-gray-500">
                  {r.name[0]}
                </div>
                <span className="text-xs font-medium text-gray-900">{r.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}