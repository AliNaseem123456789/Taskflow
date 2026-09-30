import { useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { getTheme, setTheme } from "../utils/theme";

const NEXT = { light: "dark", dark: "system", system: "light" };
const ICON = { light: Sun, dark: Moon, system: Monitor };
const LABEL = { light: "Light", dark: "Dark", system: "System" };

// Cycles light → dark → system. `withLabel` shows the text next to the icon.
export default function ThemeToggle({ withLabel = false, className = "" }) {
  const [theme, setLocal] = useState(getTheme());
  const Icon = ICON[theme];

  const cycle = () => {
    const next = NEXT[theme];
    setTheme(next);
    setLocal(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} (click to change)`}
      className={className}
    >
      <Icon size={16} strokeWidth={1.5} />
      {withLabel && <span>Theme: {LABEL[theme]}</span>}
    </button>
  );
}
