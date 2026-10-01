import { useLocation } from "react-router-dom";
import { areaFor } from "../utils/areas";

// The coloured icon tile for the current part of the app (or for `path`)
export default function AreaTile({ path, size = "md", className = "" }) {
  const { pathname } = useLocation();
  const { icon: Icon, hue } = areaFor(path || pathname);
  const box = size === "sm" ? "w-7 h-7 rounded-lg" : size === "lg" ? "w-12 h-12" : "w-10 h-10";
  const px = size === "sm" ? 16 : size === "lg" ? 26 : 22;
  return (
    <span className={`tile tile-${hue} ${box} ${className}`} aria-hidden="true">
      <Icon size={px} weight="fill" />
    </span>
  );
}
