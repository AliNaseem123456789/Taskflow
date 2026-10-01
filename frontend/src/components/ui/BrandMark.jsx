import { CheckFat } from "@phosphor-icons/react";

// The Task Flow mark: a filled check on the indigo tile, optionally with the wordmark
export default function BrandMark({ size = 32, word = true, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="tile tile-indigo is-on" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
        <CheckFat size={Math.round(size * 0.56)} weight="fill" />
      </span>
      {word && <span className="font-display font-bold text-gray-900" style={{ fontSize: Math.max(15, size * 0.6) }}>Task Flow</span>}
    </span>
  );
}
