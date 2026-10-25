/**
 * Random number sources.
 *
 * Every generator receives an `Rng` instead of calling Math.random() or crypto
 * directly. That gives us two things:
 *   1. Secrets always use the cryptographically secure source (secureRng).
 *   2. Tests can use a seeded source and get the same output every run.
 */
export interface Rng {
  /** Uniform integer in [0, max). */
  int(max: number): number;
  /** A uniformly random element. Works on arrays and strings. */
  pick<T>(items: ArrayLike<T>): T;
  /** Fisher–Yates shuffle, in place. Returns the same array. */
  shuffle<T>(items: T[]): T[];
  /** True with probability p (0–1). */
  chance(p: number): boolean;
}

const TWO_POW_32 = 0x1_0000_0000;

/** Builds an Rng from any source of uniform 32-bit unsigned integers. */
export function createRng(nextUint32: () => number): Rng {
  function int(max: number): number {
    if (!Number.isInteger(max) || max < 1 || max > TWO_POW_32) {
      throw new RangeError(`max must be an integer from 1 to 2^32, got ${max}`);
    }
    // Rejection sampling: `x % max` is only uniform if x is drawn from a range
    // that is an exact multiple of max. Values at or above `limit` would make
    // the smallest results slightly more likely, so we throw them away.
    const limit = Math.floor(TWO_POW_32 / max) * max;
    let x: number;
    do {
      x = nextUint32();
    } while (x >= limit);
    return x % max;
  }

  return {
    int,
    pick<T>(items: ArrayLike<T>): T {
      if (items.length === 0) throw new RangeError("Cannot pick from an empty list");
      return items[int(items.length)];
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    chance(p: number): boolean {
      return nextUint32() / TWO_POW_32 < p;
    },
  };
}

/** Cryptographically secure. Use for anything that is a secret. */
export const secureRng: Rng = createRng(() => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
});

/** FNV-1a: turns a text seed into a 32-bit number. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (const ch of seed) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic: the same seed always gives the same sequence (mulberry32).
 * Fine for tests and reproducible names. NEVER use it for secrets — anyone
 * who knows the seed can regenerate the output.
 */
export function seededRng(seed: string): Rng {
  let state = hashSeed(seed);
  return createRng(() => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  });
}
