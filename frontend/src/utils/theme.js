// Light / dark / system theme, remembered in this browser.
const KEY = "theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export const getTheme = () => {
  try {
    return localStorage.getItem(KEY) || "system";
  } catch {
    return "system";
  }
};

export const applyTheme = (theme = getTheme()) => {
  const dark = theme === "dark" || (theme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
};

export const setTheme = (theme) => {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: still switch for this visit
  }
  applyTheme(theme);
};

// Follow the OS setting while the user is on "system"
media.addEventListener("change", () => {
  if (getTheme() === "system") applyTheme("system");
});
