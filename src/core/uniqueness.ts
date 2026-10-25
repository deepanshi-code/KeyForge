import { MYTHIC_WORDS } from "../data/words.ts";
import { trainModel } from "./markov.ts";
import type { Rng } from "./rng.ts";
import type { SelectField } from "./types.ts";

/**
 * How unusual generated names should be. Shared by every name generator so
 * the option looks and behaves the same everywhere.
 *   familiar → everyday words ("clever_owl")
 *   rare     → real but uncommon words ("umbral_kestrel")
 *   invented → brand-new words from a Markov model ("vespyra")
 */
export type Uniqueness = "familiar" | "rare" | "invented";

export const UNIQUENESS_FIELD: SelectField = {
  kind: "select",
  key: "uniqueness",
  label: "Uniqueness",
  choices: [
    { value: "familiar", label: "Familiar" },
    { value: "rare", label: "Rare" },
    { value: "invented", label: "Invented" },
  ],
  help: "Invented = brand-new words that don't exist anywhere.",
};

/** Trained once when the module loads; small enough to be instant. */
const mythicModel = trainModel(MYTHIC_WORDS);

/** A new invented word, e.g. "vespyra", or null if none fits the length. */
export function inventWord(rng: Rng, minLength: number, maxLength: number): string | null {
  if (maxLength < minLength) return null;
  return mythicModel.generate(rng, minLength, maxLength);
}

/** Picks a word from a list that fits in `space` letters, or null. */
export function pickFitting(list: readonly string[], space: number, rng: Rng): string | null {
  const options = list.filter(w => w.length <= space);
  return options.length > 0 ? rng.pick(options) : null;
}
