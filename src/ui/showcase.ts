import { PRESETS } from "../core/presets.ts";
import { findGenerator } from "../core/registry.ts";
import { secureRng } from "../core/rng.ts";
import { similarFavourites } from "../core/taste.ts";
import type { Generator } from "../core/types.ts";
import { reducedMotion } from "./ambient.ts";
import { byId, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { mockFor } from "./preview.ts";

/**
 * "How it works": three steps, each with a live picture of the real app — the
 * same cards, previews and stars, filled with names generated right now — so
 * the pictures are never out of date the way screenshots would be.
 */

/** A small app window: title bar with dots, then the content. */
function frame(title: string, ...content: (Node | string)[]): HTMLElement {
  return h("div", { class: "shot-window" },
    h("div", { class: "shot-bar" }, h("span", { class: "shot-dots" }, h("i", {}), h("i", {}), h("i", {})), h("span", {}, title)),
    h("div", { class: "shot-body" }, ...content),
  );
}

/** A result card like the Create screen's, in miniature. */
function miniCard(value: string, starred = false): HTMLElement {
  return h("div", { class: `mini-card${starred ? " starred" : ""}` },
    h("span", { class: "mini-value" }, value),
    h("span", { class: "mini-actions" }, icon("volume"), icon("image"), icon("star", starred)),
  );
}

function names(gen: Generator, count: number, options: Record<string, string | number | boolean> = {}): string[] {
  const out = new Set<string>();
  for (let i = 0; i < count * 4 && out.size < count; i++) {
    try {
      out.add(gen.generate({ ...gen.defaults, ...options }, secureRng));
    } catch {
      // an unlucky draw: try again
    }
  }
  return [...out];
}

export function startShowcase(isVisible: () => boolean): void {
  const shot1 = byId("shot1");
  const shot2 = byId("shot2");
  const shot3 = byId("shot3");
  const found = findGenerator("username");
  if (!found) return;
  const username: Generator = found;
  const tiles = PRESETS.slice(0, 6);
  let tick = 0;

  /** Step 1: the "What are you naming?" tiles, with one being picked. */
  function renderStep1(): void {
    const picked = tick % tiles.length;
    shot1.replaceChildren(frame("keyforge · start",
      h("p", { class: "shot-heading" }, "What are you naming?"),
      h("div", { class: "mini-tiles" }, ...tiles.map((p, i) =>
        h("div", { class: `mini-tile${i === picked ? " picked" : ""}` }, h("span", { class: "mini-tile-icon" }, icon(p.icon)), h("span", {}, p.title)),
      )),
    ));
  }

  /** Step 2: real result cards, and the first one previewed as a profile. */
  function renderStep2(): void {
    const preset = tiles[tick % tiles.length];
    const gen = findGenerator(preset.generatorId) ?? username;
    const list = names(gen, 3, preset.options);
    if (list.length === 0) return;
    const preview = h("div", { class: "shot-mock" }, mockFor(gen, list[0], gen.id === "project-name" ? "app" : "profile"));
    shot2.replaceChildren(frame(`keyforge · ${gen.name.toLowerCase()}`,
      h("div", { class: "shot-split" },
        h("div", { class: "mini-cards" }, ...list.map(v => miniCard(v))),
        preview,
      ),
    ));
  }

  /** Step 3: stars filling one by one, then "Similar to…" and the lock. */
  function renderStep3(): void {
    const list = names(username, 3, { style: "professional" });
    const starredCount = 1 + (tick % 3);
    const favourites = list.slice(0, starredCount);
    // Like the real taste learning: from a batch of fresh candidates, suggest the one most like the stars.
    const candidates = names(username, 12, { style: "professional" }).filter(v => !list.includes(v));
    const best = candidates
      .map(v => ({ v, similar: similarFavourites(v, favourites) }))
      .sort((a, b) => b.similar.length - a.similar.length)[0];
    const fresh = best?.v ?? list[0];
    const similar = best?.similar ?? [];
    shot3.replaceChildren(frame("keyforge · saved",
      h("div", { class: "mini-cards" }, ...list.map((v, i) => miniCard(v, i < starredCount))),
      h("p", { class: "mini-why" }, icon("sparkle"), similar.length > 0 ? `Next up: ${fresh}, similar to ${similar.join(", ")}` : `Learning from ${starredCount} star${starredCount === 1 ? "" : "s"}…`),
      h("p", { class: "mini-lock" }, icon("lock"), "Encrypted on this device"),
    ));
  }

  const render = () => {
    renderStep1();
    renderStep2();
    renderStep3();
  };
  render();
  if (reducedMotion()) return; // one still picture of each step

  setInterval(() => {
    if (!isVisible() || document.hidden) return;
    tick++;
    render();
  }, 3600);
}
