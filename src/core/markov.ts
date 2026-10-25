import type { Rng } from "./rng.ts";
import { isClean } from "./text.ts";

/**
 * Invents new, pronounceable words with a character-level Markov chain.
 *
 * Training: for every word, record which letter follows each pair of letters
 * ("order 2"). From "nova" we learn: "^^"→n, "^n"→o, "no"→v, "ov"→a, "va"→$
 * (^ = start, $ = end).
 *
 * Generating: start at "^^" and repeatedly pick a letter that followed the
 * last two letters somewhere in the training words. Letters that followed
 * more often are picked more often, because they appear in the list more times.
 * The result sounds like the training words without being one of them.
 */
const START = "^";
const END = "$";

export interface WordModel {
  /** A new word (never one of the training words), or null if none was found. */
  generate(rng: Rng, minLength: number, maxLength: number): string | null;
}

/** Rejects awkward results: three identical letters, or four consonants in a row. */
function isPronounceable(word: string): boolean {
  return !/(.)\1\1/.test(word) && !/[^aeiouy]{4}/.test(word);
}

export function trainModel(words: readonly string[], order = 2): WordModel {
  const transitions = new Map<string, string[]>();
  for (const word of words) {
    const padded = START.repeat(order) + word + END;
    for (let i = order; i < padded.length; i++) {
      const key = padded.slice(i - order, i);
      const next = transitions.get(key) ?? [];
      next.push(padded[i]);
      transitions.set(key, next);
    }
  }
  const training = new Set(words);

  return {
    generate(rng, minLength, maxLength) {
      for (let attempt = 0; attempt < 300; attempt++) {
        let state = START.repeat(order);
        let word = "";
        while (word.length <= maxLength) {
          // Every state we can reach was seen during training, so this list exists.
          const next = rng.pick(transitions.get(state)!);
          if (next === END) break;
          word += next;
          state = (state + next).slice(-order);
        }
        if (
          word.length >= minLength && word.length <= maxLength &&
          !training.has(word) && isPronounceable(word) && isClean(word)
        ) {
          return word;
        }
      }
      return null;
    },
  };
}
