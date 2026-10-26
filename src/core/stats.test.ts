import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./library.ts";
import { createBatchStars, createStats, twoProportionPValue, wilsonInterval } from "./stats.ts";

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) };
}

describe("batch stars", () => {
  it("counts a value once, however often its star is toggled", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(new Map([["nova", "taste"], ["old-favourite", "taste"]]));
    stars.toggled("nova", true);
    stars.toggled("nova", false);
    stars.toggled("nova", true);
    expect(stats.summary().taste.starred).toBe(1);
  });

  it("takes the credit back when a star is removed", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(new Map([["nova", "random"]]));
    stars.toggled("nova", true);
    stars.toggled("nova", false);
    expect(stats.summary().random.starred).toBe(0);
  });

  it("doesn't remove stars it never recorded", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(new Map([["nova", "taste"], ["old-favourite", "taste"]]));
    stars.toggled("old-favourite", false); // starred in an earlier batch, un-starred now
    expect(stats.summary().taste.starred).toBe(0);
  });

  it("ignores stars on batches that aren't part of the experiment", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch();
    stars.toggled("nova", true);
    expect(stats.summary().taste.starred + stats.summary().random.starred).toBe(0);
  });
});

describe("batch stars per arm", () => {
  it("credits each star to the arm that picked that result", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(new Map([["a", "taste"], ["b", "random"]]));
    stars.toggled("a", true);
    stars.toggled("b", true);
    expect(stats.summary().taste.starred).toBe(1);
    expect(stats.summary().random.starred).toBe(1);
  });
});

describe("significance", () => {
  it("gives a sensible 95% range for a rate", () => {
    const [low, high] = wilsonInterval(10, 100);
    expect(low).toBeCloseTo(0.0552, 3);
    expect(high).toBeCloseTo(0.1744, 3);
  });

  it("flags a big difference as unlikely to be luck", () => {
    // 30% vs 10% with 200 shown each: clearly different.
    expect(twoProportionPValue({ shown: 200, starred: 60 }, { shown: 200, starred: 20 })!).toBeLessThan(0.001);
  });

  it("doesn't flag a small difference on small numbers", () => {
    expect(twoProportionPValue({ shown: 20, starred: 4 }, { shown: 20, starred: 3 })!).toBeGreaterThan(0.5);
  });

  it("needs data in both groups", () => {
    expect(twoProportionPValue({ shown: 0, starred: 0 }, { shown: 10, starred: 1 })).toBeNull();
  });
});
