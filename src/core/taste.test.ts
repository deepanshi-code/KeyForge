import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./library.ts";
import { seededRng } from "./rng.ts";
import { createStats } from "./stats.ts";
import { EXPLORE_SHARE, rankByTaste, similarFavourites, trainTaste } from "./taste.ts";

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

  it("mixes taste picks with a random baseline, in shuffled order", () => {
    const ranked = rankByTaste(pool, model, 8, seededRng("explore"));
    const taste = ranked.filter(r => r.source === "taste");
    const explore = ranked.filter(r => r.source === "explore");
    expect(explore).toHaveLength(Math.round(8 * EXPLORE_SHARE));
    expect(taste).toHaveLength(8 - explore.length);
    // Taste picks are the best-scoring candidates that weren't drawn at random.
    const others = pool.filter(v => !explore.some(e => e.value === v));
    const bestOthers = [...others].sort((a, b) => model.score(b) - model.score(a)).slice(0, taste.length);
    expect(taste.map(t => t.value).sort()).toEqual(bestOthers.sort());
  });

  it("draws the random picks from the whole pool, so they are a fair baseline", () => {
    // If random picks came only from leftovers, the best candidate could never be one.
    const best = [...pool].sort((a, b) => model.score(b) - model.score(a))[0];
    let bestWasRandom = 0;
    for (let i = 0; i < 300; i++) {
      if (rankByTaste(pool, model, 8, seededRng(`fair${i}`)).some(r => r.source === "explore" && r.value === best)) bestWasRandom++;
    }
    // Expected about 2/12 of the time.
    expect(bestWasRandom).toBeGreaterThan(20);
  });

  it("doesn't always put taste picks first (no position advantage)", () => {
    const firstSources = new Set<string>();
    for (let i = 0; i < 50; i++) firstSources.add(rankByTaste(pool, model, 8, seededRng(`pos${i}`))[0].source);
    expect(firstSources).toEqual(new Set(["taste", "explore"]));
  });

  it("copes with a pool smaller than the request", () => {
    expect(rankByTaste(["a", "b"], model, 5, seededRng("small"))).toHaveLength(2);
  });
});

describe("similarFavourites", () => {
  it("names the favourites a result most resembles", () => {
    const favs = ["vesper_flux", "sable_comet", "brick_tractor"];
    expect(similarFavourites("vesper_comet", favs)).toEqual(expect.arrayContaining(["vesper_flux", "sable_comet"]));
    expect(similarFavourites("vesper_comet", favs)).not.toContain("brick_tractor");
  });

  it("returns nothing when no favourite is similar", () => {
    expect(similarFavourites("zzz", ["abc"])).toEqual([]);
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
    store.setItem("toolkit:stats:v2", "{broken");
    expect(createStats(store).summary().random.shown).toBe(0);
  });
});
