const THEME_KEY = "taskflow-theme";

export function readThemeChoice() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function resolveTheme(choice) {
  if (choice === "light" || choice === "dark") return choice;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(choice) {
  const resolved = resolveTheme(choice);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function saveThemeChoice(choice) {
  localStorage.setItem(THEME_KEY, choice);
  applyTheme(choice);
}

export function startTheme() {
  applyTheme(readThemeChoice());
  const media = window.matchMedia("(prefers-color-scheme: light)");
  function onChange() {
    if (readThemeChoice() === "system") applyTheme("system");
  }
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
