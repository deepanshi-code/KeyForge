import type { Rng } from "./rng.ts";

/**
 * "Learn my taste": a tiny model of what the user likes, trained only on
 * their own favourites, entirely in the browser.
 *
 * It is a character trigram model (like the Markov generator, but used for
 * scoring instead of writing): it learns how often each letter follows each
 * pair of letters in the favourites. A candidate that "sounds like" the
 * favourites gets a high average probability per letter. A small length
 * term prefers names of a similar length.
 */
export const MIN_FAVOURITES = 3;
/** Share of results that are deliberately NOT taste-ranked, so new styles still appear. */
export const EXPLORE_SHARE = 0.25;
/** How many candidates to generate per result when ranking by taste. */
export const POOL_FACTOR = 6;

const ALPHABET_SIZE = 28; // a–z, space, end marker
const SMOOTHING = 0.5;    // add-k smoothing: unseen letter combinations get a small probability, not zero

/** Lowercase letters only; separators, digits and symbols become a space. */
function normalise(value: string): string {
  // "NoteNest" → "note nest", "deepa_dev" → "deepa dev"
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export interface TasteModel {
  /** Higher = more like the favourites. Comparable across candidates of any length. */
  score(value: string): number;
}

export function trainTaste(favourites: readonly string[]): TasteModel {
  const counts = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  let totalLength = 0;

  for (const fav of favourites) {
    const text = normalise(fav);
    totalLength += text.length;
    const padded = `^^${text}$`;
    for (let i = 2; i < padded.length; i++) {
      const context = padded.slice(i - 2, i);
      const next = padded[i];
      const row = counts.get(context) ?? new Map<string, number>();
      row.set(next, (row.get(next) ?? 0) + 1);
      counts.set(context, row);
      totals.set(context, (totals.get(context) ?? 0) + 1);
    }
  }
  const meanLength = favourites.length > 0 ? totalLength / favourites.length : 0;

  return {
    score(value) {
      const text = normalise(value);
      const padded = `^^${text}$`;
      let logProb = 0;
      for (let i = 2; i < padded.length; i++) {
        const context = padded.slice(i - 2, i);
        const seen = counts.get(context)?.get(padded[i]) ?? 0;
        const total = totals.get(context) ?? 0;
        logProb += Math.log((seen + SMOOTHING) / (total + SMOOTHING * ALPHABET_SIZE));
      }
      const perLetter = logProb / (padded.length - 2);
      const lengthPenalty = meanLength > 0 ? Math.abs(text.length - meanLength) / meanLength : 0;
      return perLetter - 0.5 * lengthPenalty;
    },
  };
}

export interface RankedResult {
  value: string;
  /** 0–100: where this candidate's score falls among the whole pool. */
  match: number;
  /** "taste" = picked for similarity, "explore" = picked at random on purpose. */
  source: "taste" | "explore";
}

/**
 * Picks `count` results from a larger candidate pool: most are the best taste
 * matches, the rest are random picks from the remainder (exploration), so the
 * user isn't stuck seeing only one kind of name.
 */
export function rankByTaste(candidates: readonly string[], model: TasteModel, count: number, rng: Rng): RankedResult[] {
  const scored = candidates.map(value => ({ value, score: model.score(value) }));
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const percentile = new Map(byScore.map((c, i) => [c.value, Math.round(100 * (1 - i / Math.max(1, byScore.length - 1)))]));

  const tasteCount = Math.min(byScore.length, Math.ceil(count * (1 - EXPLORE_SHARE)));
  const picked: RankedResult[] = byScore.slice(0, tasteCount)
    .map(c => ({ value: c.value, match: percentile.get(c.value) ?? 0, source: "taste" }));

  const rest = rng.shuffle(byScore.slice(tasteCount));
  for (const c of rest.slice(0, count - picked.length)) {
    picked.push({ value: c.value, match: percentile.get(c.value) ?? 0, source: "explore" });
  }
  return picked;
}
