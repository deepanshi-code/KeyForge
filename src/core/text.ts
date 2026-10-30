import { ALLOWLIST, BLOCKLIST } from "../data/blocklist.ts";

/** Lowercase letters and digits only: "Deepanshi A." → "deepanshia". */
export function cleanWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Splits free text ("cloud, notes  ai") into unique clean words. */
export function parseKeywords(text: string, minLength = 2): string[] {
  const words = text.split(/[\s,]+/).map(cleanWord).filter(w => w.length >= minLength);
  return [...new Set(words)];
}

/** First letters of a word without trailing vowels, so endings attach smoothly: "deepa" → "deep". */
export function stem(word: string, maxLength: number): string {
  const s = word.slice(0, maxLength).replace(/[aeiouy]+$/, "");
  return s.length >= 2 ? s : word.slice(0, 3);
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export type CaseStyle = "pascal" | "lower" | "kebab" | "title";

export function joinWords(words: string[], style: CaseStyle): string {
  switch (style) {
    case "pascal":
      return words.map(capitalize).join("");
    case "lower":
      return words.join("");
    case "kebab":
      return words.join("-");
    case "title":
      return words.map(capitalize).join(" ");
  }
}

/**
 * False if the text contains a blocked word anywhere, including across word
 * joins. Allowlisted words are blanked out first so "Ishita" passes.
 */
export function isClean(text: string): boolean {
  let t = text.toLowerCase();
  for (const ok of ALLOWLIST) t = t.replaceAll(ok, " ");
  return !BLOCKLIST.some(bad => t.includes(bad));
}

/** Removes duplicates while keeping order. */
export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
