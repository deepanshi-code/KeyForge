import type { KeyValueStore } from "./library.ts";

/**
 * Measures whether taste learning actually helps, fairly. Every taste-learning
 * batch mixes taste picks with random picks from the same candidates, in
 * shuffled order (see rankByTaste). Both groups are shown at the same time, to
 * the same person, in the same mood, so comparing their star rates is a fair
 * test — unlike comparing "learning on" with "learning off", where the user
 * chooses when each happens.
 */
export type Arm = "taste" | "random";

interface Counts { shown: number; starred: number }
type StatsData = Record<Arm, Counts>;

/** v2: earlier stats compared on/off modes, which was biased, so they aren't carried over. */
const KEY = "toolkit:stats:v2";
const empty = (): StatsData => ({ taste: { shown: 0, starred: 0 }, random: { shown: 0, starred: 0 } });

export function createStats(store: KeyValueStore) {
  function read(): StatsData {
    try {
      const data = JSON.parse(store.getItem(KEY) ?? "null") as StatsData | null;
      if (data && typeof data.taste?.shown === "number" && typeof data.random?.shown === "number") return data;
    } catch {
      // corrupted: start again
    }
    return empty();
  }

  function write(data: StatsData): void {
    try {
      store.setItem(KEY, JSON.stringify(data));
    } catch {
      // storage unavailable: stats just won't persist
    }
  }

  return {
    recordShown(arm: Arm, n: number): void {
      if (n === 0) return;
      const data = read();
      data[arm].shown += n;
      write(data);
    },
    recordStar(arm: Arm): void {
      const data = read();
      data[arm].starred += 1;
      write(data);
    },
    /** Takes back a star recorded earlier (the user un-starred it). */
    removeStar(arm: Arm): void {
      const data = read();
      data[arm].starred = Math.max(0, data[arm].starred - 1);
      write(data);
    },
    /** Star rate per arm (0–1), or null if nothing was shown yet. */
    summary(): Record<Arm, Counts & { rate: number | null }> {
      const data = read();
      const withRate = (c: Counts) => ({ ...c, rate: c.shown > 0 ? c.starred / c.shown : null });
      return { taste: withRate(data.taste), random: withRate(data.random) };
    },
    reset: () => write(empty()),
  };
}

export type Stats = ReturnType<typeof createStats>;

/**
 * Credits stars on the visible batch to the arm that picked each result. Each
 * value counts at most once, and un-starring takes the credit back — otherwise
 * clicking ☆ on, off, on would count as two stars and inflate the star rate.
 */
export function createBatchStars(stats: Stats) {
  /** Which arm picked each visible result; empty = this batch isn't measured. */
  let arms = new Map<string, Arm>();
  const credited = new Set<string>();

  return {
    /** A new batch is on screen. Pass no arms for batches that aren't part of the experiment. */
    newBatch(batchArms: ReadonlyMap<string, Arm> = new Map()): void {
      arms = new Map(batchArms);
      credited.clear();
    },
    /** Call after the user toggles a star on a result in this batch. */
    toggled(value: string, nowFavourite: boolean): void {
      const arm = arms.get(value);
      if (!arm) return;
      if (nowFavourite && !credited.has(value)) {
        credited.add(value);
        stats.recordStar(arm);
      } else if (!nowFavourite && credited.delete(value)) {
        stats.removeStar(arm);
      }
    },
  };
}

// ---- Is the difference real? ----

/** Wilson score interval: a 95% range for a rate, sensible even for small counts. */
export function wilsonInterval(starred: number, shown: number, z = 1.96): [number, number] {
  if (shown === 0) return [0, 1];
  const p = starred / shown;
  const denominator = 1 + (z * z) / shown;
  const centre = (p + (z * z) / (2 * shown)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / shown + (z * z) / (4 * shown * shown))) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

/** Standard normal cumulative probability (Abramowitz–Stegun approximation, error < 1e-7). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/**
 * Two-proportion z-test: how likely a difference this big would be if taste
 * and random picks were really starred equally often. Small p (< 0.05) means
 * the difference is unlikely to be luck.
 */
export function twoProportionPValue(a: Counts, b: Counts): number | null {
  if (a.shown === 0 || b.shown === 0) return null;
  const pooled = (a.starred + b.starred) / (a.shown + b.shown);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.shown + 1 / b.shown));
  if (se === 0) return 1;
  const z = (a.starred / a.shown - b.starred / b.shown) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}
