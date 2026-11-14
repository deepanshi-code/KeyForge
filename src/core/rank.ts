import { HINDI_WORDS } from "../data/words.ts";
import type { TasteModel } from "./taste.ts";

/**
 * Learning-to-rank from stars AND skips.
 *
 * The trigram taste model only learns what you like. This model also learns
 * what you pass over: names you saw (they stayed on screen) but didn't star.
 * It's logistic regression — a weighted sum of simple, explainable features
 * squashed into a probability — trained in the browser in milliseconds.
 *
 * Features: length, number of words, separators, digits, vowel patterns,
 * rare letters, double letters, whether it contains a Hindi word, plus
 * "hashed" letter pairs and triples (each pattern is mapped to one of 128
 * slots), which capture the sound/style of a name the way trigrams do.
 */
const HASH_SLOTS = 128;
const HINDI = Object.keys(HINDI_WORDS);
export const FEATURE_NAMES = [
  "bias", "length", "words", "underscore", "dot", "hyphen", "space", "digits", "vowel ratio",
  "ends in vowel", "starts with vowel", "rare letters", "double letters", "Hindi word",
] as const;
const BASE = FEATURE_NAMES.length;
export const FEATURES = BASE + HASH_SLOTS;

/** FNV-1a hash of a short string, into a slot. */
function slot(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) % HASH_SLOTS;
}

export function features(value: string): Float64Array {
  const x = new Float64Array(FEATURES);
  const words = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const letters = words.join("").replace(/[0-9]/g, "");
  const n = Math.max(1, letters.length);
  x[0] = 1;
  x[1] = value.length / 20;
  x[2] = words.length / 3;
  // One feature per separator: people often like dots but not underscores, or the reverse.
  x[3] = value.includes("_") ? 1 : 0;
  x[4] = value.includes(".") ? 1 : 0;
  x[5] = value.includes("-") ? 1 : 0;
  x[6] = value.includes(" ") ? 1 : 0;
  x[7] = /[0-9]/.test(value) ? 1 : 0;
  x[8] = (letters.match(/[aeiou]/g)?.length ?? 0) / n;
  x[9] = /[aeiouy]$/.test(letters) ? 1 : 0;
  x[10] = /^[aeiou]/.test(letters) ? 1 : 0;
  x[11] = (letters.match(/[jkqvxz]/g)?.length ?? 0) / n;
  x[12] = /(.)\1/.test(letters) ? 1 : 0;
  x[13] = words.some(w => HINDI.includes(w) || HINDI.some(h => w.length > h.length + 1 && (w.startsWith(h) || w.endsWith(h)))) ? 1 : 0;
  for (const word of words) {
    const padded = `^${word}$`;
    for (let size = 2; size <= 3; size++) {
      for (let i = 0; i + size <= padded.length; i++) x[BASE + slot(padded.slice(i, i + size))] += 1 / Math.sqrt(n);
    }
  }
  return x;
}

export interface Ranker extends TasteModel {
  weights: Float64Array;
}

/**
 * Trains the ranker. Classes are balanced (you skip far more than you star),
 * and L2 regularisation keeps it from memorising a handful of examples.
 */
export function trainRanker(liked: readonly string[], skipped: readonly string[], opts = { iterations: 300, lr: 0.5, l2: 0.01 }): Ranker {
  const data = [
    ...liked.map(v => ({ x: features(v), y: 1, weight: 0.5 / Math.max(1, liked.length) })),
    ...skipped.map(v => ({ x: features(v), y: 0, weight: 0.5 / Math.max(1, skipped.length) })),
  ];
  const w = new Float64Array(FEATURES);
  for (let it = 0; it < opts.iterations; it++) {
    const grad = new Float64Array(FEATURES);
    for (const { x, y, weight } of data) {
      let z = 0;
      for (let i = 0; i < FEATURES; i++) z += w[i] * x[i];
      const error = 1 / (1 + Math.exp(-z)) - y; // d(log-loss)/dz
      for (let i = 0; i < FEATURES; i++) grad[i] += weight * error * x[i];
    }
    for (let i = 0; i < FEATURES; i++) w[i] -= opts.lr * (grad[i] + (i === 0 ? 0 : opts.l2 * w[i]));
  }
  return {
    weights: w,
    score(value) {
      const x = features(value);
      let z = 0;
      for (let i = 0; i < FEATURES; i++) z += w[i] * x[i];
      return z;
    },
  };
}

/**
 * AUC: the chance a random liked name scores above a random skipped one.
 * 0.5 = no better than guessing, 1 = perfect. The standard ranking metric.
 */
export function auc(model: TasteModel, liked: readonly string[], skipped: readonly string[]): number {
  if (liked.length === 0 || skipped.length === 0) return 0.5;
  const pos = liked.map(v => model.score(v));
  const neg = skipped.map(v => model.score(v));
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
