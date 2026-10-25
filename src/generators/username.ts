import type { Rng } from "../core/rng.ts";
import { cleanWord, isClean, stem } from "../core/text.ts";
import { GenerationError, type Generator } from "../core/types.ts";
import { inventWord, pickFitting, UNIQUENESS_FIELD, type Uniqueness } from "../core/uniqueness.ts";
import {
  ADJECTIVES, CUTE_ADJECTIVES, CUTE_ENDINGS, CUTE_NOUNS, GAMER_ENDINGS, GAMER_NOUNS, GAMER_PREFIXES,
  NAME_MORPH_ENDINGS, NAME_PREFIXES, NAME_SUFFIXES, NOUNS, PRO_SUFFIXES, RARE_ADJECTIVES,
  RARE_GAMER_PREFIXES, RARE_NOUNS,
} from "../data/words.ts";

export type UsernameOptions = {
  style: string;
  uniqueness: string;
  name: string;
  interest: string;
  separator: string;
  numbers: boolean;
  maxLength: number;
};

const SEPARATORS: Record<string, string> = { none: "", underscore: "_", dot: "." };
const MIN_LENGTH = 3;
const MAX_ATTEMPTS = 120;

/**
 * A source of words. `pick(space)` returns a word of at most `space` letters
 * (or null); `min` is the shortest word it can give, so we can leave room for it.
 */
interface Source {
  min: number;
  pick(space: number): string | null;
}

/** Builds one username's parts. Returns null if nothing fit this time. */
function buildParts(
  opts: UsernameOptions, name: string, interest: string, room: number, rng: Rng,
): string[] | null {
  const uniqueness = opts.uniqueness as Uniqueness;

  const list = (words: readonly string[]): Source => ({
    min: Math.min(...words.map(w => w.length)),
    pick: space => pickFitting(words, space, rng),
  });
  const invented = (min = 4, max = 9): Source => ({
    min,
    pick: space => inventWord(rng, min, Math.min(space, max)),
  });
  /** The user's interest replaces the word ~60% of the time, when it fits. */
  const orInterest = (src: Source): Source => interest
    ? { min: Math.min(src.min, interest.length), pick: s => (interest.length <= s && rng.chance(0.6) ? interest : src.pick(s)) }
    : src;
  const pair = (a: Source, b: Source): string[] | null => {
    const first = a.pick(room - b.min);
    const second = first ? b.pick(room - first.length) : null;
    return first && second ? [first, second] : null;
  };
  const single = (a: Source): string[] | null => {
    const word = a.pick(room);
    return word ? [word] : null;
  };
  const fixed = (word: string): Source => ({ min: word.length, pick: s => (word.length <= s ? word : null) });

  const cuteify = (w: string) => stem(w, 4) + rng.pick(CUTE_ENDINGS);
  const gamerify = (w: string) => stem(w, 6) + rng.pick(GAMER_ENDINGS);
  const morph = (w: string) => stem(w, 5) + rng.pick(NAME_MORPH_ENDINGS);

  switch (opts.style) {
    case "professional": {
      if (name) {
        if (uniqueness === "familiar") return pair(fixed(name), orInterest(list(PRO_SUFFIXES)));
        if (uniqueness === "invented") return rng.chance(0.5) ? [morph(name)] : pair(fixed(morph(name)), list(PRO_SUFFIXES));
        // Rare: modern handle patterns — "itsdeepa", "builtbydeepa", "deepa.irl".
        return rng.chance(0.5) ? [rng.pick(NAME_PREFIXES) + name] : pair(fixed(name), list(NAME_SUFFIXES));
      }
      if (uniqueness === "familiar") return pair(list(ADJECTIVES), orInterest(list(NOUNS)));
      if (uniqueness === "rare") return pair(list(RARE_ADJECTIVES), orInterest(list(RARE_NOUNS)));
      return rng.chance(0.5) ? single(invented(5)) : pair(invented(4, 7), list(PRO_SUFFIXES));
    }

    case "gamer": {
      const prefixes = list(uniqueness === "familiar" ? GAMER_PREFIXES : RARE_GAMER_PREFIXES);
      const nouns = list(uniqueness === "familiar" ? GAMER_NOUNS : [...GAMER_NOUNS, ...RARE_NOUNS]);
      if (uniqueness === "invented") {
        const base = name ? stem(name, 6) : inventWord(rng, 4, 7);
        if (!base) return null;
        return rng.chance(0.5) ? [gamerify(base)] : pair(prefixes, fixed(gamerify(base)));
      }
      if (name) return rng.chance(0.5) ? pair(prefixes, fixed(name)) : pair(fixed(name), orInterest(nouns));
      return pair(prefixes, orInterest(nouns));
    }

    case "cute": {
      if (name && uniqueness !== "familiar") {
        return rng.chance(0.5) ? [cuteify(name)] : pair(list(CUTE_ADJECTIVES), fixed(cuteify(name)));
      }
      if (name) return pair(fixed(name), orInterest(list(CUTE_NOUNS)));
      if (uniqueness === "familiar") return pair(list(CUTE_ADJECTIVES), orInterest(list(CUTE_NOUNS)));
      if (uniqueness === "rare") return pair(list(CUTE_ADJECTIVES), orInterest(list(RARE_NOUNS)));
      const word = inventWord(rng, 3, 6);
      return word ? (rng.chance(0.5) ? [cuteify(word)] : pair(list(CUTE_ADJECTIVES), fixed(cuteify(word)))) : null;
    }

    case "minimal": {
      const word: Source = uniqueness === "familiar"
        ? list(NOUNS.filter(w => w.length <= 5))
        : uniqueness === "rare" ? list(RARE_NOUNS.filter(w => w.length <= 6)) : invented(4, 6);
      if (!name) return single(orInterest(word));
      return pair(fixed(rng.chance(0.5) ? name.charAt(0) : name.slice(0, 4)), orInterest(word));
    }

    default:
      throw new GenerationError(`Unknown style "${opts.style}".`);
  }
}

export const usernameGenerator: Generator<UsernameOptions> = {
  id: "username",
  name: "Username",
  icon: "user",
  description: "Handles that stand out — random, or built around your name and interests.",
  sensitive: false,
  fields: [
    {
      kind: "select", key: "style", label: "Style",
      choices: [
        { value: "professional", label: "Professional" },
        { value: "gamer", label: "Gamer" },
        { value: "minimal", label: "Minimal" },
        { value: "cute", label: "Cute" },
      ],
    },
    UNIQUENESS_FIELD,
    { kind: "text", key: "name", label: "Your name (optional)", placeholder: "e.g. Deepa", maxLength: 40, help: "Only the first word is used." },
    { kind: "text", key: "interest", label: "An interest (optional)", placeholder: "e.g. chess", maxLength: 20 },
    {
      kind: "select", key: "separator", label: "Separator",
      choices: [
        { value: "none", label: "None" },
        { value: "underscore", label: "Underscore _" },
        { value: "dot", label: "Dot ." },
      ],
    },
    { kind: "number", key: "maxLength", label: "Max length", min: 6, max: 30, help: "Instagram allows 30, X allows 15." },
    { kind: "boolean", key: "numbers", label: "Add numbers" },
  ],
  defaults: {
    style: "professional", uniqueness: "rare", name: "", interest: "",
    separator: "underscore", numbers: false, maxLength: 18,
  },

  generate(opts, rng) {
    const name = cleanWord(opts.name.trim().split(/\s+/)[0] ?? "");
    const interest = cleanWord(opts.interest);
    const digits = opts.numbers ? 2 : 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // If the separator keeps making names too long, try the second half without it.
      const sep = attempt < MAX_ATTEMPTS / 2 ? (SEPARATORS[opts.separator] ?? "") : "";
      const parts = buildParts(opts, name, interest, opts.maxLength - digits - sep.length, rng);
      if (!parts) continue;
      let username = parts.join(sep);
      // Two digits (10–99): avoids looking like a birth year, which leaks personal info.
      if (opts.numbers) username += String(10 + rng.int(90));
      if (username.length >= MIN_LENGTH && username.length <= opts.maxLength && isClean(username)) {
        return username;
      }
    }
    throw new GenerationError(
      `Couldn't make a suitable username within ${opts.maxLength} characters. Try a longer max length or a different name.`,
    );
  },
};
