import { entropyBits, strengthNote } from "../core/entropy.ts";
import type { Rng } from "../core/rng.ts";
import type { Generator } from "../core/types.ts";

export type PasswordOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
};

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*-_=+?",
} as const;

/** Characters that are easy to confuse when read or typed by hand. */
const AMBIGUOUS = /[Il1O0o]/g;

/** The character sets the user selected, after removing ambiguous characters if asked. */
export function selectedSets(opts: PasswordOptions): string[] {
  const keys = (Object.keys(SETS) as (keyof typeof SETS)[]).filter(k => opts[k]);
  return keys.map(k => (opts.excludeAmbiguous ? SETS[k].replace(AMBIGUOUS, "") : SETS[k]));
}

export const passwordGenerator: Generator<PasswordOptions> = {
  id: "password",
  name: "Password",
  icon: "lock",
  description: "Random passwords built with your browser's cryptographically secure random generator.",
  sensitive: true,
  fields: [
    { kind: "number", key: "length", label: "Length", min: 4, max: 128 },
    { kind: "boolean", key: "upper", label: "Uppercase (A–Z)" },
    { kind: "boolean", key: "lower", label: "Lowercase (a–z)" },
    { kind: "boolean", key: "numbers", label: "Numbers (0–9)" },
    { kind: "boolean", key: "symbols", label: "Symbols (!@#…)" },
    { kind: "boolean", key: "excludeAmbiguous", label: "Avoid look-alikes (I l 1 O 0 o)" },
  ],
  defaults: { length: 16, upper: true, lower: true, numbers: true, symbols: true, excludeAmbiguous: false },

  validate(opts) {
    const sets = selectedSets(opts);
    if (sets.length === 0) return "Select at least one character type.";
    if (opts.length < sets.length) return `Length must be at least ${sets.length} to include every selected type.`;
    return null;
  },

  generate(opts, rng: Rng) {
    const sets = selectedSets(opts);
    const pool = sets.join("");
    // One character from each selected set guarantees every type appears;
    // the rest come from the whole pool, then the order is shuffled.
    const chars = sets.map(set => rng.pick(set));
    while (chars.length < opts.length) chars.push(rng.pick(pool));
    return rng.shuffle(chars).join("");
  },

  describe(_value, opts) {
    // Slight overestimate: forcing one of each type removes a little randomness.
    const poolSize = selectedSets(opts).join("").length;
    return strengthNote(entropyBits(opts.length, poolSize));
  },
};
