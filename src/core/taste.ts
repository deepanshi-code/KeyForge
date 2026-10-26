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
/**
 * Share of results picked at random instead of by taste. They keep new styles
 * appearing and act as the baseline that taste picks are measured against.
 */
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
  /** "taste" = picked for similarity, "explore" = picked uniformly at random from the same pool. */
  source: "taste" | "explore";
}

/**
 * Picks `count` results from a larger candidate pool and mixes two groups,
 * so the batch doubles as a fair experiment (interleaving, as search engines
 * use to compare rankings):
 *   - explore: EXPLORE_SHARE of the results, drawn uniformly at random from
 *     the WHOLE pool — a true "no learning" baseline, not leftovers.
 *   - taste: the best-scoring candidates among the rest.
 * The final order is shuffled, so neither group gets the top positions.
 * Comparing how often each group is starred then shows whether learning helps.
 */
export function rankByTaste(candidates: readonly string[], model: TasteModel, count: number, rng: Rng): RankedResult[] {
  const byScore = candidates.map(value => ({ value, score: model.score(value) })).sort((a, b) => b.score - a.score);
  const percentile = new Map(byScore.map((c, i) => [c.value, Math.round(100 * (1 - i / Math.max(1, byScore.length - 1)))]));
  const total = Math.min(count, byScore.length);
  const exploreCount = Math.min(total, Math.round(total * EXPLORE_SHARE));

  const explore = new Set(rng.shuffle(byScore.map(c => c.value)).slice(0, exploreCount));
  const taste = byScore.filter(c => !explore.has(c.value)).slice(0, total - exploreCount).map(c => c.value);

  const result = (value: string, source: RankedResult["source"]): RankedResult =>
    ({ value, match: percentile.get(value) ?? 0, source });
  return rng.shuffle([...taste.map(v => result(v, "taste")), ...[...explore].map(v => result(v, "explore"))]);
}

/** Trigrams of a value, after the same normalisation the model uses. */
function trigrams(value: string): Set<string> {
  const text = ` ${normalise(value)} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= text.length; i++) grams.add(text.slice(i, i + 3));
  return grams;
}

/**
 * "Why this?": the favourites a result most resembles, by shared letter
 * triples (Jaccard similarity). Makes the ranking explainable.
 */
export function similarFavourites(value: string, favourites: readonly string[], limit = 2): string[] {
  const mine = trigrams(value);
  return favourites
    .map(fav => {
      const theirs = trigrams(fav);
      let shared = 0;
      for (const g of mine) if (theirs.has(g)) shared++;
      return { fav, similarity: shared / (mine.size + theirs.size - shared || 1) };
    })
    .filter(x => x.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(x => x.fav);
}
