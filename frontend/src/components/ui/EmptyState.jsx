import { Sparkle } from "@phosphor-icons/react";

// What to do when there's nothing here yet: an icon, one line, and (optionally) the action that fills it
export default function EmptyState({ icon: Icon = Sparkle, hue = "indigo", title, text, action }) {
  return (
    <div className="px-6 py-12 flex flex-col items-center text-center">
      <span className={`tile tile-${hue} w-12 h-12 mb-3`}><Icon size={26} weight="duotone" /></span>
      {title && <p className="font-display text-lg font-bold text-gray-900">{title}</p>}
      {text && <p className="text-sm text-gray-500 mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
