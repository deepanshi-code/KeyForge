import type { KeyValueStore } from "./library.ts";
import { seededRng } from "./rng.ts";

/**
 * Measures whether taste learning actually helps, fairly.
 *
 * Every taste-learning batch mixes taste picks with random picks from the same
 * candidates, in shuffled order (see rankByTaste). Each batch is recorded once
 * it has actually been seen — it stayed on screen, or you starred something —
 * and only if it's big enough to compare (MIN_BATCH_SIZE, with at least one
 * random pick).
 *
 * The analysis is PER BATCH: for each batch, taste star rate minus random star
 * rate. Stars within one batch aren't independent (people tend to star about
 * one per batch), so treating every name as an independent coin flip would
 * overstate the evidence. The verdict uses a sign-flip permutation test on
 * those differences, a strict p < 0.01, and at least MIN_BATCHES batches —
 * strict because the panel is looked at again and again, and every look is
 * another chance for luck to look like a result.
 */
export type Arm = "taste" | "random";
export type ModelKind = "trigram" | "ranker";

export const MIN_BATCH_SIZE = 4;
export const MIN_BATCHES = 20;
export const ALPHA = 0.01;

export interface BatchRecord {
  id: number;
  model: ModelKind;
  taste: { shown: number; starred: number };
  random: { shown: number; starred: number };
}

interface StatsData {
  nextId: number;
  batches: BatchRecord[];
}

/** v3: v2 counted every name as independent and counted batches nobody saw, so it isn't carried over. */
const KEY = "toolkit:stats:v3";
const MAX_BATCHES = 1000;
const empty = (): StatsData => ({ nextId: 1, batches: [] });

export function createStats(store: KeyValueStore) {
  function read(): StatsData {
    try {
      const data = JSON.parse(store.getItem(KEY) ?? "null") as StatsData | null;
      if (data && typeof data.nextId === "number" && Array.isArray(data.batches)) return data;
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
    /** Records a seen batch. Returns its id, or null if it's too small to compare fairly. */
    addBatch(model: ModelKind, tasteShown: number, randomShown: number): number | null {
      if (tasteShown + randomShown < MIN_BATCH_SIZE || tasteShown === 0 || randomShown === 0) return null;
      const data = read();
      const id = data.nextId++;
      data.batches.push({ id, model, taste: { shown: tasteShown, starred: 0 }, random: { shown: randomShown, starred: 0 } });
      data.batches = data.batches.slice(-MAX_BATCHES);
      write(data);
      return id;
    },
    /** A star added (+1) or taken back (−1) on a result in a recorded batch. */
    star(batchId: number, arm: Arm, delta: 1 | -1): void {
      const data = read();
      const batch = data.batches.find(b => b.id === batchId);
      if (!batch) return;
      batch[arm].starred = Math.min(batch[arm].shown, Math.max(0, batch[arm].starred + delta));
      write(data);
    },
    batches: (): BatchRecord[] => read().batches,
    reset: () => write(empty()),
  };
}

export type Stats = ReturnType<typeof createStats>;

/**
 * Credits stars on the visible batch to the group that picked each result.
 * The batch is only recorded once it's been seen (`seen()`), so batches that
 * flashed past while you dragged a slider don't count. Each value counts at
 * most once, and un-starring takes the credit back.
 */
export function createBatchStars(stats: Stats) {
  let arms = new Map<string, Arm>();
  let model: ModelKind = "trigram";
  let batchId: number | null = null;
  let recorded = false;
  const credited = new Set<string>();

  return {
    /** A new batch is on screen. Pass no arms for batches that aren't part of the experiment. */
    newBatch(batchArms: ReadonlyMap<string, Arm> = new Map(), kind: ModelKind = "trigram"): void {
      arms = new Map(batchArms);
      model = kind;
      batchId = null;
      recorded = false;
      credited.clear();
    },
    /** The batch has been seen (stayed on screen, or was acted on): record it, once. */
    seen(): void {
      if (recorded || arms.size === 0) return;
      recorded = true;
      const tasteShown = [...arms.values()].filter(a => a === "taste").length;
      batchId = stats.addBatch(model, tasteShown, arms.size - tasteShown);
    },
    /** Call after the user toggles a star on a result in this batch. */
    toggled(value: string, nowFavourite: boolean): void {
      const arm = arms.get(value);
      if (!arm) return;
      this.seen();
      if (batchId === null) return;
      if (nowFavourite && !credited.has(value)) {
        credited.add(value);
        stats.star(batchId, arm, 1);
      } else if (!nowFavourite && credited.delete(value)) {
        stats.star(batchId, arm, -1);
      }
    },
  };
}

// ---- Analysis ----

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
 * Two-proportion z-test. Only valid when every item is independent — used by
 * the offline ML experiment (independent samples), not for Insights.
 */
export function twoProportionPValue(a: { shown: number; starred: number }, b: { shown: number; starred: number }): number | null {
  if (a.shown === 0 || b.shown === 0) return null;
  const pooled = (a.starred + b.starred) / (a.shown + b.shown);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.shown + 1 / b.shown));
  if (se === 0) return 1;
  const z = (a.starred / a.shown - b.starred / b.shown) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * Sign-flip permutation test on paired differences: if taste and random were
 * really equal, each batch's difference would be as likely positive as
 * negative. Flip signs at random many times and see how often the mean is at
 * least as far from 0 as the real one. Two-sided. No normality assumption.
 */
export function signFlipPValue(diffs: readonly number[], iterations = 10_000): number | null {
  if (diffs.length === 0) return null;
  const observed = Math.abs(diffs.reduce((a, b) => a + b, 0));
  if (observed === 0) return 1;
  const rng = seededRng(`sign-flip:${diffs.length}:${observed}`); // deterministic: same data, same answer
  let extreme = 0;
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (const d of diffs) sum += rng.chance(0.5) ? d : -d;
    if (Math.abs(sum) >= observed - 1e-12) extreme++;
  }
  return (extreme + 1) / (iterations + 1);
}

export interface Analysis {
  batches: number;
  rankerBatches: number;
  taste: { shown: number; starred: number; rate: number | null };
  random: { shown: number; starred: number; rate: number | null };
  /** Mean of per-batch (taste rate − random rate), with a 95% interval. */
  meanDiff: number | null;
  diffInterval: [number, number] | null;
  pValue: number | null;
  verdict: "not-enough-data" | "taste-better" | "random-better" | "no-clear-difference";
}

export function analyse(batches: readonly BatchRecord[]): Analysis {
  const sum = (arm: Arm) => {
    const shown = batches.reduce((a, b) => a + b[arm].shown, 0);
    const starred = batches.reduce((a, b) => a + b[arm].starred, 0);
    return { shown, starred, rate: shown > 0 ? starred / shown : null };
  };
  const diffs = batches.map(b => b.taste.starred / b.taste.shown - b.random.starred / b.random.shown);
  const n = diffs.length;
  const meanDiff = n > 0 ? diffs.reduce((a, b) => a + b, 0) / n : null;
  let diffInterval: [number, number] | null = null;
  if (n >= 2 && meanDiff !== null) {
    const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - meanDiff) ** 2, 0) / (n - 1));
    const half = 1.96 * (sd / Math.sqrt(n));
    diffInterval = [meanDiff - half, meanDiff + half];
  }
  const pValue = signFlipPValue(diffs);
  const verdict: Analysis["verdict"] = n < MIN_BATCHES || pValue === null
    ? "not-enough-data"
    : pValue < ALPHA
      ? (meanDiff ?? 0) > 0 ? "taste-better" : "random-better"
      : "no-clear-difference";
  return {
    batches: n,
    rankerBatches: batches.filter(b => b.model === "ranker").length,
    taste: sum("taste"),
    random: sum("random"),
    meanDiff,
    diffInterval,
    pValue,
    verdict,
  };
}
