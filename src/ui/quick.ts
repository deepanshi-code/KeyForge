import type { Preset } from "../core/presets.ts";
import { forge } from "./ambient.ts";
import { byId, copyText, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

/**
 * Home's "Try it" card: real names the moment the page opens, no setup.
 * Pick what you're naming, click a name to copy it, or open the full tool
 * with those settings. This is the shortest path from landing to a name.
 */
const QUICK_IDS = ["instagram", "startup", "desi", "team", "character"];
const COUNT = 5;

export function setupQuickForge(presets: readonly Preset[], openPreset: (preset: Preset) => void): void {
  const chips = byId("quickChips");
  const list = byId("quickList");
  const more = byId<HTMLAnchorElement>("quickMore");
  const quick = QUICK_IDS.map(id => presets.find(p => p.id === id)).filter((p): p is Preset => p !== undefined);
  if (quick.length === 0) return;
  let active = quick[0];

  function names(preset: Preset): string[] {
    const out = new Set<string>();
    for (let i = 0; i < COUNT * 4 && out.size < COUNT; i++) {
      const name = forge(preset);
      if (name) out.add(name);
    }
    return [...out];
  }

  function render(): void {
    for (const chip of chips.children) chip.setAttribute("aria-pressed", String((chip as HTMLElement).dataset.id === active.id));
    more.href = `#${active.generatorId}`;
    more.textContent = `More ${active.title.toLowerCase()} options →`;
    list.replaceChildren(...names(active).map((name, i) => {
      const button = h("button", { type: "button", class: "quick-name", style: `--i:${i}` },
        h("span", { class: "visually-hidden" }, "Copy "),
        h("span", { class: "quick-value" }, name),
        h("span", { class: "quick-copy", "aria-hidden": "true" }, icon("copy")),
      );
      button.addEventListener("click", async () => {
        if (!(await copyText(name))) {
          toast("Couldn't copy. Try selecting the text instead.", "error");
          return;
        }
        button.classList.add("copied");
        button.querySelector(".quick-copy")?.replaceChildren(icon("check"));
        toast(`Copied ${name}`);
        setTimeout(() => {
          button.classList.remove("copied");
          button.querySelector(".quick-copy")?.replaceChildren(icon("copy"));
        }, 1200);
      });
      return h("li", {}, button);
    }));
  }

  chips.replaceChildren(...quick.map(preset => {
    const chip = h("button", { type: "button", class: "chip", "data-id": preset.id, "aria-pressed": "false" }, preset.title);
    chip.addEventListener("click", () => {
      active = preset;
      render();
    });
    return chip;
  }));
  byId("quickShuffle").addEventListener("click", render);
  more.addEventListener("click", event => {
    event.preventDefault();
    openPreset(active);
  });
  render();
}
