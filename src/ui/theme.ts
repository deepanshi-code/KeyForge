import { icon } from "./icons.ts";

const THEME_KEY = "toolkit:theme";

/**
 * Light, dark, or follow the system. The colours live in main.css; "system"
 * just removes the data-theme attribute so the CSS media query decides.
 * index.html applies a saved choice before first paint, so there's no flash.
 */
const MODES = [
  { id: "system", label: "System theme", icon: "monitor" },
  { id: "light", label: "Light theme", icon: "sun" },
  { id: "dark", label: "Dark theme", icon: "moon" },
] as const;

type Mode = (typeof MODES)[number]["id"];

function savedMode(): Mode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyMode(mode: Mode): void {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  // Match the browser/phone UI colour to the page background.
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

/** A button that cycles System → Light → Dark. */
export function setupThemeToggle(button: HTMLButtonElement): void {
  let mode = savedMode();
  const label = button.querySelector(".nav-label");

  const render = () => {
    const m = MODES.find(x => x.id === mode)!;
    button.querySelector(".icon")?.replaceWith(icon(m.icon));
    if (label) label.textContent = m.label;
    button.title = `${m.label} (click to change)`;
  };

  button.prepend(icon("monitor"));
  applyMode(mode);
  render();

  button.addEventListener("click", () => {
    mode = MODES[(MODES.findIndex(x => x.id === mode) + 1) % MODES.length].id;
    applyMode(mode);
    render();
    try {
      if (mode === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Not saved; the theme still applies for this visit.
    }
  });
}
