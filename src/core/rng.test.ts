import { describe, expect, it } from "vitest";
import { createRng, secureRng, seededRng, type Rng } from "./rng.ts";

/**
 * Chi-square goodness-of-fit for rng.int(buckets). For 10 buckets (9 degrees
 * of freedom) a fair source scores above 27.88 only 0.1% of the time.
 */
function chiSquare(rng: Rng, buckets: number, samples: number): number {
  const counts = new Array<number>(buckets).fill(0);
  for (let i = 0; i < samples; i++) counts[rng.int(buckets)]++;
  const expected = samples / buckets;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
}
const CHI_SQUARE_CRITICAL_9DF = 27.88;

describe("createRng", () => {
  it("returns integers in [0, max)", () => {
    const rng = seededRng("range");
    for (const max of [1, 2, 3, 7, 10, 26, 1000, 2 ** 31]) {
      for (let i = 0; i < 500; i++) {
        const x = rng.int(max);
        expect(Number.isInteger(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(max);
      }
    }
  });

  it("rejects values that would cause modulo bias", () => {
    // For max = 3 the limit is 4294967295 (largest multiple of 3 ≤ 2^32),
    // so 0xFFFFFFFF must be thrown away and the next value used instead.
    const values = [0xffffffff, 5];
    const rng = createRng(() => values.shift()!);
    expect(rng.int(3)).toBe(5 % 3);
    expect(values).toHaveLength(0);
  });

  it("throws for invalid max", () => {
    const rng = seededRng("bad");
    for (const max of [0, -1, 1.5, NaN, 2 ** 32 + 1]) {
      expect(() => rng.int(max)).toThrow(RangeError);
    }
  });

  it("pick works on arrays and strings, and rejects empty input", () => {
    const rng = seededRng("pick");
    expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
    expect("xyz").toContain(rng.pick("xyz"));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("shuffle returns a permutation of the same items", () => {
    const rng = seededRng("shuffle");
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = rng.shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});

describe("seededRng", () => {
  it("is reproducible for the same seed", () => {
    const a = seededRng("hello");
    const b = seededRng("hello");
    const seqA = Array.from({ length: 20 }, () => a.int(1000));
    const seqB = Array.from({ length: 20 }, () => b.int(1000));
    expect(seqA).toEqual(seqB);
  });

  it("differs between seeds", () => {
    const a = seededRng("one");
    const b = seededRng("two");
    expect(Array.from({ length: 20 }, () => a.int(1000))).not.toEqual(Array.from({ length: 20 }, () => b.int(1000)));
  });

  it("is uniform (chi-square, deterministic)", () => {
    expect(chiSquare(seededRng("uniform"), 10, 100_000)).toBeLessThan(CHI_SQUARE_CRITICAL_9DF);
  });
});

describe("secureRng", () => {
  it("is uniform (chi-square; a fair source fails this ~0.1% of runs)", () => {
    expect(chiSquare(secureRng, 10, 100_000)).toBeLessThan(CHI_SQUARE_CRITICAL_9DF);
  });
});
