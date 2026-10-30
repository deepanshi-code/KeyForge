import type { Rng } from "../core/rng.ts";
import { isClean, joinWords, parseKeywords, stem, type CaseStyle } from "../core/text.ts";
import { GenerationError, type Generator } from "../core/types.ts";
import { inventWord } from "../core/uniqueness.ts";
import {
  CLASSIC_ROOTS, HINDI_ADJECTIVES, HINDI_WORDS, HINGLISH_ENDINGS, HINGLISH_THINGS, PROJECT_PREFIXES,
  PROJECT_SUFFIXES, TECH_WORDS,
} from "../data/words.ts";

export type ProjectNameOptions = {
  keywords: string;
  technique: string;
  caseStyle: string;
};

/** "Surprise me" picks from these; "invented" is listed twice so mixes lean unique. */
const MIX = ["compound", "blend", "affix", "classic", "hinglish", "invented", "invented"] as const;
const HINDI = Object.keys(HINDI_WORDS);
const HINDI_NOUNS = HINDI.filter(w => !(HINDI_ADJECTIVES as readonly string[]).includes(w));
const BRAND_ENDINGS = ["ora", "ix", "io", "ium", "era", "yx", "ana", "eon", "ly", "iva"];
const MIN_LENGTH = 4;
const MAX_LENGTH = 18;

/**
 * Portmanteau by shared letter: find a letter in the back half of `a` that
 * also appears in the front half of `b`, and overlap the words there.
 *   "spark" + "kernel" → "sparkernel"
 *   "cloud" + "data"   → "cloudata"
 *   "byte"  + "echo"   → "bytecho"
 * Returns null when the words share no suitable letter.
 */
export function blend(a: string, b: string): string | null {
  for (let i = a.length - 1; i >= Math.ceil(a.length / 2); i--) {
    const j = b.indexOf(a[i]);
    if (j >= 0 && j <= b.length / 2) return a.slice(0, i) + b.slice(j);
  }
  return null;
}

function buildParts(technique: string, keywords: string[], rng: Rng): string[] | null {
  // Prefer the user's keywords, but mix in tech words for variety.
  const base = () => (keywords.length > 0 && rng.chance(0.7) ? rng.pick(keywords) : rng.pick(TECH_WORDS));

  switch (technique) {
    case "compound": {
      const first = base();
      let second = rng.pick(TECH_WORDS);
      while (second === first) second = rng.pick(TECH_WORDS);
      return [first, second];
    }
    case "blend": {
      for (let tries = 0; tries < 20; tries++) {
        const a = base();
        const b = rng.pick(TECH_WORDS);
        const blended = a === b ? null : blend(a, b);
        if (blended) return [blended];
      }
      return buildParts("compound", keywords, rng);
    }
    case "affix":
      return rng.chance(0.5) ? [rng.pick(PROJECT_PREFIXES), base()] : [base() + rng.pick(PROJECT_SUFFIXES)];
    case "classic":
      return rng.chance(0.5) ? [rng.pick(CLASSIC_ROOTS), base()] : [rng.pick(CLASSIC_ROOTS) + rng.pick(PROJECT_SUFFIXES)];
    case "hinglish": {
      // One Hindi + one English word, in the orders real Hinglish brands use.
      const thing = keywords.length > 0 && rng.chance(0.7) ? rng.pick(keywords) : rng.pick(HINGLISH_THINGS);
      const roll = rng.int(10);
      if (roll < 5) return [thing, rng.pick(HINDI_NOUNS)];          // "Form Saathi", "Study Dost"
      if (roll < 8) return [rng.pick(HINDI_NOUNS), rng.pick(HINGLISH_ENDINGS)]; // "Dukaan Pay", "Yatra Hub"
      return [rng.pick(HINDI_ADJECTIVES), thing];                    // "Apna Shop", "Asaan Form"
    }
    case "invented": {
      // A keyword reshaped into a brand ("notes" → "Notora"), or a brand-new word ("Vespyra").
      if (keywords.length > 0 && rng.chance(0.5)) return [stem(rng.pick(keywords), 5) + rng.pick(BRAND_ENDINGS)];
      const word = inventWord(rng, 5, 9);
      return word ? [word] : null;
    }
    default:
      throw new GenerationError(`Unknown technique "${technique}".`);
  }
}

export const projectNameGenerator: Generator<ProjectNameOptions> = {
  id: "project-name",
  name: "Project name",
  icon: "folder",
  description: "Brandable names for apps, repos and side projects — from your keywords or from scratch.",
  sensitive: false,
  fields: [
    {
      kind: "text", key: "keywords", label: "Keywords (optional)", placeholder: "e.g. notes, study, cloud",
      maxLength: 80, help: "What is your project about? Separate with commas or spaces.",
    },
    {
      kind: "select", key: "technique", label: "Naming technique",
      choices: [
        { value: "any", label: "Surprise me (mix of all)" },
        { value: "invented", label: "Invented word — Vespyra, Notora" },
        { value: "blend", label: "Blended words — Cloudata" },
        { value: "compound", label: "Two words joined — CodeForge" },
        { value: "affix", label: "Prefix / suffix — Noteify, OmniNote" },
        { value: "classic", label: "Latin & Greek roots — LumenStack" },
        { value: "hinglish", label: "Hinglish — Form Saathi" },
      ],
      help: "Different ways of building a name. Hinglish mixes a Hindi and an English word. Not sure? Keep “Surprise me”.",
    },
    {
      kind: "select", key: "caseStyle", label: "Case",
      choices: [
        { value: "pascal", label: "PascalCase" },
        { value: "lower", label: "lowercase" },
        { value: "kebab", label: "kebab-case" },
        { value: "title", label: "Title Case" },
      ],
    },
  ],
  defaults: { keywords: "", technique: "any", caseStyle: "pascal" },

  generate(opts, rng) {
    const keywords = parseKeywords(opts.keywords);
    for (let attempt = 0; attempt < 100; attempt++) {
      const technique = opts.technique === "any" ? rng.pick(MIX) : opts.technique;
      const parts = buildParts(technique, keywords, rng);
      if (!parts) continue;
      const letters = parts.join("").length;
      if (letters >= MIN_LENGTH && letters <= MAX_LENGTH && isClean(parts.join(""))) {
        return joinWords(parts, opts.caseStyle as CaseStyle);
      }
    }
    throw new GenerationError("Couldn't build a name from those keywords. Try shorter keywords.");
  },

  /** Hinglish names say what their Hindi word means: "saathi = companion". */
  describe(value) {
    const meanings = hindiMeanings(value);
    return meanings.length > 0 ? { text: meanings.map(([w, m]) => `${w} = ${m} (Hindi)`).join(" · ") } : null;
  },
};

/**
 * Finds Hindi words in a generated name, in any case style. Names are split at
 * spaces, hyphens and capitals ("FormSaathi" → form, saathi); an all-lowercase
 * name is checked for a Hindi word at its start or end.
 */
export function hindiMeanings(value: string): [string, string][] {
  const parts = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s-]+/).filter(Boolean);
  const found = new Set(parts.filter(p => p in HINDI_WORDS));
  if (found.size === 0 && parts.length === 1) {
    const [word] = parts;
    for (const hindi of HINDI) {
      const rest = word.length - hindi.length;
      if (rest >= 2 && (word.startsWith(hindi) || word.endsWith(hindi))) found.add(hindi);
    }
  }
  return [...found].map(w => [w, HINDI_WORDS[w]]);
}
