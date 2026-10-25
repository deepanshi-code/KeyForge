import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./library.ts";
import { createBatchStars, createStats } from "./stats.ts";

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) };
}

describe("batch stars", () => {
  it("counts a value once, however often its star is toggled", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch("taste");
    stars.toggled("nova", true);
    stars.toggled("nova", false);
    stars.toggled("nova", true);
    expect(stats.summary().taste.starred).toBe(1);
  });

  it("takes the credit back when a star is removed", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch("random");
    stars.toggled("nova", true);
    stars.toggled("nova", false);
    expect(stats.summary().random.starred).toBe(0);
  });

  it("doesn't remove stars it never recorded", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch("taste");
    stars.toggled("old-favourite", false); // starred in an earlier batch, un-starred now
    expect(stats.summary().taste.starred).toBe(0);
  });

  it("ignores stars during warm-up", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(null);
    stars.toggled("nova", true);
    expect(stats.summary().taste.starred + stats.summary().random.starred).toBe(0);
  });
});
