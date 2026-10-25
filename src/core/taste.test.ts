import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./library.ts";
import { seededRng } from "./rng.ts";
import { createStats } from "./stats.ts";
import { EXPLORE_SHARE, rankByTaste, trainTaste } from "./taste.ts";

describe("taste model", () => {
  const model = trainTaste(["umbral_kestrel", "astral_osprey", "lunar_heron", "sable_magpie"]);

  it("scores names that sound like the favourites higher", () => {
    // Bird-ish, mystical names vs. unrelated gamer-style handles.
    expect(model.score("astral_heron")).toBeGreaterThan(model.score("xxtoxic_blaster99"));
    expect(model.score("lunar_kestrel")).toBeGreaterThan(model.score("pizza_zombie"));
  });

  it("is not fooled by case or separators", () => {
    expect(model.score("LunarHeron")).toBeCloseTo(model.score("lunar_heron"), 5);
    expect(model.score("lunar.heron")).toBeCloseTo(model.score("lunar-heron"), 5);
  });

  it("prefers similar lengths", () => {
    // Same letters repeated: only the length differs.
    expect(model.score("astral_heron")).toBeGreaterThan(model.score("astral_heron_astral_heron_astral"));
  });

  it("treats every candidate equally when there are no favourites", () => {
    const empty = trainTaste([]);
    expect(empty.score("abc")).toBeCloseTo(empty.score("xyz"), 5);
  });
});

describe("rankByTaste", () => {
  const model = trainTaste(["nova", "lumen", "astra", "lyra"]);
  const pool = ["nova_x", "lumina", "astrid", "brick", "tractor", "spreadsheet", "lyria", "fridge", "noval", "plumbing", "ladder", "asteria"];

  it("returns the requested number of unique results", () => {
    const ranked = rankByTaste(pool, model, 6, seededRng("count"));
    expect(ranked).toHaveLength(6);
    expect(new Set(ranked.map(r => r.value)).size).toBe(6);
  });

  it("puts the best matches first and keeps some exploration", () => {
    const ranked = rankByTaste(pool, model, 8, seededRng("explore"));
    const taste = ranked.filter(r => r.source === "taste");
    const explore = ranked.filter(r => r.source === "explore");
    expect(taste).toHaveLength(Math.ceil(8 * (1 - EXPLORE_SHARE)));
    expect(explore.length).toBeGreaterThan(0);
    // Taste picks are ordered best-first and beat every exploration pick.
    for (let i = 1; i < taste.length; i++) expect(taste[i - 1].match).toBeGreaterThanOrEqual(taste[i].match);
    expect(Math.min(...taste.map(r => r.match))).toBeGreaterThanOrEqual(Math.max(...explore.map(r => r.match)));
  });

  it("copes with a pool smaller than the request", () => {
    expect(rankByTaste(["a", "b"], model, 5, seededRng("small"))).toHaveLength(2);
  });
});

describe("stats", () => {
  const memory = (): KeyValueStore => {
    const data = new Map<string, string>();
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) };
  };

  it("tracks star rate per mode", () => {
    const stats = createStats(memory());
    expect(stats.summary().taste.rate).toBeNull();
    stats.recordShown("taste", 10);
    stats.recordStar("taste");
    stats.recordStar("taste");
    stats.recordShown("random", 20);
    stats.recordStar("random");
    const s = stats.summary();
    expect(s.taste.rate).toBeCloseTo(0.2);
    expect(s.random.rate).toBeCloseTo(0.05);
  });

  it("survives corrupted storage", () => {
    const store = memory();
    store.setItem("toolkit:stats", "{broken");
    expect(createStats(store).summary().random.shown).toBe(0);
  });
});
