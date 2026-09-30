import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { applyTheme } from "./utils/theme";

applyTheme(); // before the first paint, so there's no white flash

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
