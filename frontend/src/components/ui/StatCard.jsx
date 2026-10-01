// A number that matters, with a coloured icon tile. hue: indigo | amber | sky | teal | violet | rose
export default function StatCard({ label, value, icon: Icon, hue = "indigo", note, tone }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
      {Icon && (
        <span className={`tile tile-${hue} w-10 h-10`}>
          <Icon size={22} weight="fill" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-500">{label}</p>
        <p className={`font-display text-[28px] leading-none font-bold mt-1.5 ${tone === "bad" ? "text-rose-600" : "text-gray-900"}`}>{value}</p>
        {note && <p className="text-xs text-gray-400 mt-1.5">{note}</p>}
      </div>
    </div>
  );
}
