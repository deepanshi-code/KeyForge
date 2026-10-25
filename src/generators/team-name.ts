import type { Rng } from "../core/rng.ts";
import { capitalize, isClean } from "../core/text.ts";
import { GenerationError, type Generator } from "../core/types.ts";
import { inventWord, UNIQUENESS_FIELD, type Uniqueness } from "../core/uniqueness.ts";
import { ADJECTIVES, RARE_ADJECTIVES, TEAM_COLLECTIVES, TEAM_SIZE_WORDS, TEAM_THEMES, TECH_WORDS } from "../data/words.ts";

export type TeamNameOptions = {
  theme: string;
  members: number;
  useCount: boolean;
  uniqueness: string;
  alliterate: boolean;
};

const title = (...words: string[]) => words.map(capitalize).join(" ");

/** Picks from `list`, restricted to words starting with `letter` when given. */
function startingWith(list: readonly string[], letter: string | null, rng: Rng): string | null {
  const options = letter ? list.filter(w => w.startsWith(letter)) : list;
  return options.length > 0 ? rng.pick(options) : null;
}

/**
 * Like startingWith, but alliteration is a preference, not a requirement:
 * if fewer than 2 words alliterate, any word is fine. Without this, the same
 * few combinations ("Quantum Quartet") win over and over.
 */
function preferStartingWith(list: readonly string[], letter: string | null, rng: Rng): string {
  const options = letter ? list.filter(w => w.startsWith(letter)) : [];
  return rng.pick(options.length >= 2 ? options : list);
}

/** Pattern weights when the member count is used (out of 100). */
const COUNT_PATTERNS = [
  { pattern: "group", weight: 25 },  // "Quantum Quartet"
  { pattern: "number", weight: 20 }, // "The Five Phoenixes"
  { pattern: "of", weight: 20 },     // "Trio of Titans"
  { pattern: "prefix", weight: 15 }, // "Hexa Hackers"
  { pattern: "roman", weight: 20 },  // "Krakens VII"
] as const;

function pickPattern(rng: Rng): (typeof COUNT_PATTERNS)[number]["pattern"] {
  let roll = rng.int(100);
  for (const { pattern, weight } of COUNT_PATTERNS) {
    if (roll < weight) return pattern;
    roll -= weight;
  }
  return "group";
}

/** One attempt at a name. Returns null if this combination didn't work out. */
function build(opts: TeamNameOptions, alliterate: boolean, rng: Rng): string | null {
  const plurals = TEAM_THEMES[opts.theme];
  if (!plurals) throw new GenerationError(`Unknown theme "${opts.theme}".`);
  const uniqueness = opts.uniqueness as Uniqueness;
  const adjectives = uniqueness === "familiar" ? ADJECTIVES : RARE_ADJECTIVES;
  /** The descriptive first word: a real adjective, or an invented word (≥ 5 letters so it reads as a name). */
  const firstWord = (letter: string | null = null): string | null =>
    uniqueness === "invented" ? inventWord(rng, 5, 8) : preferStartingWith(adjectives, letter, rng);
  /** A word from `list`, alliterating with `word` when possible. */
  const matching = (list: readonly string[], word: string) => preferStartingWith(list, alliterate ? word.charAt(0) : null, rng);

  const size = opts.useCount ? TEAM_SIZE_WORDS[opts.members] : undefined;
  if (size) {
    switch (pickPattern(rng)) {
      case "group": { // "Quantum Quartet", "Fearless Five"
        const group = rng.pick(size.group);
        const adjective = firstWord(alliterate ? group.charAt(0) : null);
        return adjective ? title(adjective, group) : null;
      }
      case "number": // "The Five Phoenixes"
        return `The ${title(size.number, matching(plurals, size.number))}`;
      case "of": { // "Trio of Titans" — only with group nouns that read well ("Quad of …" doesn't)
        if (size.of.length === 0) return null;
        const group = rng.pick(size.of);
        return `${capitalize(group)} of ${capitalize(matching(plurals, group))}`;
      }
      case "prefix": // "Hexa Hackers" — reads badly for small teams ("Bi Bots"), so 4+ only
        return opts.members >= 4 ? title(size.prefix, matching(plurals, size.prefix)) : null;
      case "roman": { // "Krakens VII"
        const first = firstWord();
        return first ? `${title(first, matching(plurals, first))} ${size.roman}` : null;
      }
    }
  }

  // Without the member count: "Byte Brigade" (tech) or "Umbral Wraiths".
  if (opts.theme === "tech" && rng.chance(0.35)) {
    const word = rng.pick(TECH_WORDS);
    const collective = startingWith(TEAM_COLLECTIVES, alliterate ? word.charAt(0) : null, rng);
    return collective ? title(word, collective) : null;
  }
  const first = firstWord();
  const plural = first ? startingWith(plurals, alliterate ? first.charAt(0) : null, rng) : null;
  return first && plural ? title(first, plural) : null;
}

export const teamNameGenerator: Generator<TeamNameOptions> = {
  id: "team-name",
  name: "Team name",
  icon: "users",
  description: "Names for hackathon teams, clubs, esports squads and study groups — shaped by how many of you there are.",
  sensitive: false,
  fields: [
    {
      kind: "select", key: "theme", label: "Theme",
      choices: [
        { value: "tech", label: "Tech / hackathon" },
        { value: "esports", label: "Esports" },
        { value: "sports", label: "Sports" },
        { value: "space", label: "Space" },
        { value: "mythology", label: "Mythology" },
        { value: "general", label: "General" },
      ],
    },
    { kind: "number", key: "members", label: "Team members", min: 2, max: 12 },
    UNIQUENESS_FIELD,
    { kind: "boolean", key: "useCount", label: "Use member count in name (Quantum Quartet)" },
    { kind: "boolean", key: "alliterate", label: "Alliteration (Byte Brigade)" },
  ],
  defaults: { theme: "tech", members: 4, useCount: true, uniqueness: "rare", alliterate: true },

  generate(opts, rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      // Alliteration is best-effort: if it keeps failing, allow non-matching words.
      const name = build(opts, opts.alliterate && attempt < 150, rng);
      if (name && isClean(name)) return name;
    }
    throw new GenerationError("Couldn't build a team name with those options.");
  },
};
