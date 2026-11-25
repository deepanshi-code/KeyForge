import { PLATFORMS } from "../generators/username.ts";
import { type NameRating, rateName, variations } from "../core/rate.ts";
import { byId, copyText, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

/**
 * The "Rate a name" screen: type any name and see, as you type, whether it
 * fits each platform, how easy it is to say and remember (with the reasons),
 * and close variations to try if it's taken.
 */
interface RateActions {
  preview: (name: string) => void;
  speak: ((name: string) => void) | null;
}

const VARIATION_PLATFORMS = [["any", "Any"], ["instagram", "Instagram"], ["x", "X"], ["github", "GitHub"], ["discord", "Discord"]] as const;

async function copy(value: string): Promise<void> {
  if (await copyText(value)) toast(`Copied ${value}`);
  else toast("Couldn't copy. Try selecting the text instead.", "error");
}

export function setupRate(actions: RateActions): { show: (name: string) => void } {
  const form = byId<HTMLFormElement>("rateForm");
  const input = byId<HTMLInputElement>("rateInput");
  const out = byId("rateResult");
  let platform: string = "any";
  let timer = 0;

  function scoreCard(r: NameRating): HTMLElement {
    const buttons = h("div", { class: "rate-actions" });
    const copyBtn = h("button", { type: "button", class: "btn" }, icon("copy"), "Copy");
    copyBtn.addEventListener("click", () => void copy(r.handle));
    buttons.append(copyBtn);
    if (actions.speak) {
      const say = h("button", { type: "button", class: "btn" }, icon("volume"), "Say it");
      say.addEventListener("click", () => actions.speak?.(r.handle));
      buttons.append(say);
    }
    const look = h("button", { type: "button", class: "btn" }, icon("image"), "Preview");
    look.addEventListener("click", () => actions.preview(r.handle));
    buttons.append(look);

    return h("div", { class: "rate-card rate-score", "data-verdict": r.verdict },
      h("p", { class: "rate-handle" }, r.handle),
      h("p", { class: "rate-number" }, h("span", {}, String(r.score)), h("small", {}, "/100")),
      h("p", { class: "rate-verdict" }, r.verdict),
      h("span", { class: "rate-meter", "aria-hidden": "true" }, h("span", { style: `width:${r.score}%` })),
      buttons,
    );
  }

  function platformCard(r: NameRating): HTMLElement {
    return h("div", { class: "rate-card" },
      h("h2", {}, "Fits on"),
      h("ul", { class: "rate-platforms" }, ...r.platforms.map(p =>
        h("li", { class: p.ok ? "ok" : "no" },
          h("span", { class: "rate-mark", "aria-hidden": "true" }, icon(p.ok ? "check" : "x")),
          h("span", { class: "rate-platform" }, p.label),
          h("span", { class: "rate-reason" }, p.ok ? "Fits" : p.reason),
        ),
      )),
    );
  }

  function notesCard(r: NameRating): HTMLElement {
    return h("div", { class: "rate-card" },
      h("h2", {}, "Why this score"),
      h("ul", { class: "rate-notes" }, ...r.notes.map(n =>
        h("li", { class: n.good ? "good" : "bad" }, h("span", { class: "visually-hidden" }, n.good ? "Good: " : "To improve: "), n.text),
      )),
    );
  }

  function variationsCard(r: NameRating): HTMLElement {
    const list = h("ul", { class: "rate-variations" });
    const fill = () => {
      const items = variations(r.handle, platform);
      list.replaceChildren(...(items.length > 0
        ? items.map(v => {
          const b = h("button", { type: "button", class: "rate-variation", title: "Copy" }, v);
          b.addEventListener("click", () => void copy(v));
          const again = h("button", { type: "button", class: "link-btn rate-again", "aria-label": `Rate ${v}` }, "Rate");
          again.addEventListener("click", () => show(v));
          return h("li", {}, b, again);
        })
        : [h("li", { class: "muted" }, "No variations fit this platform's rules.")]));
    };
    const chips = h("div", { class: "chips", role: "group", "aria-label": "Variations for" }, ...VARIATION_PLATFORMS
      .filter(([id]) => id in PLATFORMS)
      .map(([id, label]) => {
        const chip = h("button", { type: "button", class: "chip", "aria-pressed": String(id === platform) }, label);
        chip.addEventListener("click", () => {
          platform = id;
          for (const c of chips.children) c.setAttribute("aria-pressed", String(c === chip));
          fill();
        });
        return chip;
      }));
    fill();
    return h("div", { class: "rate-card rate-wide" },
      h("h2", {}, "Taken? Try these"),
      h("p", { class: "muted" }, "Close variations that follow each platform's rules. Click one to copy it."),
      chips,
      list,
    );
  }

  function render(): void {
    const value = input.value;
    if (value.trim() === "") {
      out.hidden = true;
      out.replaceChildren();
      return;
    }
    const r = rateName(value);
    out.hidden = false;
    out.replaceChildren(scoreCard(r), platformCard(r), notesCard(r), variationsCard(r));
  }

  function show(name: string): void {
    input.value = name;
    render();
    input.focus();
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(render, 200);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    clearTimeout(timer);
    render();
  });
  return { show };
}
