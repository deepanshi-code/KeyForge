import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./library.ts";
import { seededRng } from "./rng.ts";
import {
  analyse, type Arm, type BatchRecord, createBatchStars, createStats, MIN_BATCHES, signFlipPValue,
  twoProportionPValue, wilsonInterval,
} from "./stats.ts";

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) };
}

const ARMS = new Map<string, Arm>([["t1", "taste"], ["t2", "taste"], ["t3", "taste"], ["r1", "random"]]);

describe("recording batches", () => {
  it("records a batch only once it has been seen", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(ARMS);
    stars.newBatch(ARMS); // replaced before anyone looked: not counted
    expect(stats.batches()).toHaveLength(0);
    stars.seen();
    stars.seen(); // once only
    expect(stats.batches()).toHaveLength(1);
  });

  it("starring a result counts as seeing its batch, and credits the right group", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(ARMS, "ranker");
    stars.toggled("r1", true);
    expect(stats.batches()[0]).toMatchObject({ model: "ranker", taste: { shown: 3, starred: 0 }, random: { shown: 1, starred: 1 } });
  });

  it("counts a value once however often it's toggled, and takes credit back on un-star", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(ARMS);
    stars.toggled("t1", true);
    stars.toggled("t1", false);
    stars.toggled("t1", true);
    expect(stats.batches()[0].taste.starred).toBe(1);
    stars.toggled("t1", false);
    expect(stats.batches()[0].taste.starred).toBe(0);
  });

  it("doesn't record batches that are too small or have no random picks", () => {
    const stats = createStats(memoryStore());
    const stars = createBatchStars(stats);
    stars.newBatch(new Map<string, Arm>([["a", "taste"], ["b", "random"]])); // only 2
    stars.seen();
    stars.newBatch(new Map<string, Arm>([["a", "taste"], ["b", "taste"], ["c", "taste"], ["d", "taste"]])); // no random
    stars.seen();
    stars.newBatch(); // not part of the experiment
    stars.seen();
    expect(stats.batches()).toHaveLength(0);
  });
});

/** Batches of 6 taste + 2 random picks, with given star counts. */
const batch = (id: number, tasteStarred: number, randomStarred: number): BatchRecord =>
  ({ id, model: "trigram", taste: { shown: 6, starred: tasteStarred }, random: { shown: 2, starred: randomStarred } });

describe("analysis", () => {
  it("won't give a verdict before enough batches", () => {
    const few = Array.from({ length: MIN_BATCHES - 1 }, (_, i) => batch(i, 3, 0));
    expect(analyse(few).verdict).toBe("not-enough-data");
  });

  it("finds taste learning working when taste picks win batch after batch", () => {
    const rng = seededRng("strong");
    const batches = Array.from({ length: 30 }, (_, i) => batch(i, 2 + rng.int(2), rng.chance(0.15) ? 1 : 0));
    const a = analyse(batches);
    expect(a.verdict).toBe("taste-better");
    expect(a.diffInterval?.[0]).toBeGreaterThan(0);
  });

  it("finds no difference when both groups are starred at the same rate", () => {
    const rng = seededRng("null");
    // Each name starred with probability 0.25, whichever group it's in.
    const batches = Array.from({ length: 40 }, (_, i) => {
      let t = 0;
      for (let k = 0; k < 6; k++) t += rng.chance(0.25) ? 1 : 0;
      let r = 0;
      for (let k = 0; k < 2; k++) r += rng.chance(0.25) ? 1 : 0;
      return batch(i, t, r);
    });
    expect(analyse(batches).verdict).toBe("no-clear-difference");
  });

  it("keeps false alarms rare under the strict threshold", () => {
    // 100 simulated users with NO real difference: how many get a "working" verdict?
    let falseAlarms = 0;
    for (let u = 0; u < 100; u++) {
      const rng = seededRng(`user${u}`);
      const batches = Array.from({ length: 25 }, (_, i) => {
        let t = 0;
        for (let k = 0; k < 6; k++) t += rng.chance(0.2) ? 1 : 0;
        return batch(i, t, (rng.chance(0.2) ? 1 : 0) + (rng.chance(0.2) ? 1 : 0));
      });
      if (analyse(batches).verdict !== "no-clear-difference") falseAlarms++;
    }
    expect(falseAlarms).toBeLessThanOrEqual(5); // expected about 1 at alpha = 0.01
  });

  it("sign-flip test: identical groups give p = 1, consistent wins give a small p", () => {
    expect(signFlipPValue([0, 0, 0])).toBe(1);
    expect(signFlipPValue(Array(25).fill(0.3))!).toBeLessThan(0.001);
    expect(signFlipPValue([])).toBeNull();
  });
});

describe("intervals and the independent-samples test (used by the ML experiment)", () => {
  it("gives a sensible 95% range for a rate", () => {
    const [low, high] = wilsonInterval(10, 100);
    expect(low).toBeCloseTo(0.0552, 3);
    expect(high).toBeCloseTo(0.1744, 3);
  });

  it("flags a big difference and not a small one", () => {
    expect(twoProportionPValue({ shown: 200, starred: 60 }, { shown: 200, starred: 20 })!).toBeLessThan(0.001);
    expect(twoProportionPValue({ shown: 20, starred: 4 }, { shown: 20, starred: 3 })!).toBeGreaterThan(0.5);
    expect(twoProportionPValue({ shown: 0, starred: 0 }, { shown: 10, starred: 1 })).toBeNull();
  });
});
