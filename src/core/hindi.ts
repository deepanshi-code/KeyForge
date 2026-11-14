import { HINDI_WORDS } from "../data/words.ts";

const HINDI = Object.keys(HINDI_WORDS);

/**
 * Finds Hindi words in a generated name, in any case style. Names are split at
 * spaces, hyphens, underscores, dots, digits and capitals ("FormSaathi" → form,
 * saathi); a single run of letters is checked for a Hindi word at its start or end.
 */
export function hindiMeanings(value: string): [string, string][] {
  const parts = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s\-_.0-9]+/).filter(Boolean);
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

/** A result note like "saathi = companion (Hindi)", or null if there's no Hindi word. */
export function hindiNote(value: string): { text: string } | null {
  const meanings = hindiMeanings(value);
  return meanings.length > 0 ? { text: meanings.map(([w, m]) => `${w} = ${m} (Hindi)`).join(" · ") } : null;
}
