import { byId, h } from "./dom.ts";

/** Small message at the bottom of the screen that disappears on its own. */
export function toast(message: string, tone: "info" | "error" = "info"): void {
  const container = byId("toasts");
  const el = h("div", { class: `toast ${tone}`, role: tone === "error" ? "alert" : "status" }, message);
  container.append(el);
  // Keep at most 2 on screen.
  while (container.children.length > 2) container.firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 300); // fallback if animations are off
  }, 1800);
}
