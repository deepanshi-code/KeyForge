import { PLATFORMS } from "../generators/username.ts";
import { isClean } from "./text.ts";

/**
 * "Rate my name": checks a name you already have against each platform's
 * username rules, estimates how easy it is to say and remember, and suggests
 * close variations for when the name itself is taken. All rules-based and
 * explainable, so every point in the score has a reason you can read.
 */

export interface PlatformFit {
  id: string;
  label: string;
  ok: boolean;
  /** Why it doesn't fit (empty when it does). */
  reason: string;
}

export interface NameRating {
  /** The name as checked: lower case, spaces removed. */
  handle: string;
  length: number;
  syllables: number;
  /** 0–100. */
  score: number;
  verdict: "Great" | "Good" | "Okay" | "Needs work";
  platforms: PlatformFit[];
  /** Plain-language reasons behind the score, good points first. */
  notes: { good: boolean; text: string }[];
}

const LABELS: Record<string, string> = { instagram: "Instagram", x: "X (Twitter)", github: "GitHub", discord: "Discord" };
const VOWELS = /[aeiouy]+/g;

/** Turns whatever was typed into a handle: lower case, no spaces. */
export function toHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function platformFit(id: string, handle: string): PlatformFit {
  const p = PLATFORMS[id];
  const label = LABELS[id] ?? id;
  if (handle.length < p.min) return { id, label, ok: false, reason: `Too short (at least ${p.min})` };
  if (handle.length > p.max) return { id, label, ok: false, reason: `Too long (at most ${p.max})` };
  if (!p.valid.test(handle)) {
    const bad = [...new Set(handle.replace(new RegExp(`[a-z0-9${p.allowed.replace("-", "\\-")}]`, "g"), ""))];
    if (bad.length > 0) return { id, label, ok: false, reason: `Can't use ${bad.map(c => `"${c}"`).join(" ")}` };
    return { id, label, ok: false, reason: `"${p.allowed.split("").join(" ")}" can't go at the start, end or twice in a row` };
  }
  return { id, label, ok: true, reason: "" };
}

/** Rough syllable count: groups of vowels in the letters. */
function countSyllables(letters: string): number {
  return Math.max(1, (letters.match(VOWELS) ?? []).length);
}

/** The longest run of consonants, e.g. "rkstr" in "darkstream". */
function longestConsonantRun(letters: string): string {
  return (letters.match(/[^aeiouy]+/g) ?? []).reduce((a, b) => (b.length > a.length ? b : a), "");
}

export function rateName(raw: string): NameRating {
  const handle = toHandle(raw);
  const letters = handle.replace(/[^a-z]/g, "");
  const digits = handle.replace(/[^0-9]/g, "").length;
  const separators = handle.replace(/[a-z0-9]/g, "").length;
  const syllables = letters.length > 0 ? countSyllables(letters) : 0;
  const cluster = longestConsonantRun(letters);
  const notes: NameRating["notes"] = [];
  let score = 100;

  if (handle.length === 0) {
    return { handle, length: 0, syllables: 0, score: 0, verdict: "Needs work", platforms: [], notes: [{ good: false, text: "Type a name to rate it." }] };
  }

  // Length: 5–12 characters is easy to type and remember.
  if (handle.length < 4) { score -= 15; notes.push({ good: false, text: "Very short names are almost always taken." }); }
  else if (handle.length <= 12) notes.push({ good: true, text: `${handle.length} characters: short and easy to type.` });
  else if (handle.length <= 18) { score -= 8; notes.push({ good: false, text: `${handle.length} characters: a bit long to type on a phone.` }); }
  else { score -= 18; notes.push({ good: false, text: `${handle.length} characters: long names get cut off and mistyped.` }); }

  // Saying it aloud.
  if (syllables >= 2 && syllables <= 4) notes.push({ good: true, text: `${syllables} syllables: easy to say aloud.` });
  else if (syllables > 4) { score -= 8; notes.push({ good: false, text: `${syllables} syllables: a mouthful to say.` }); }
  if (cluster.length >= 4) { score -= 12; notes.push({ good: false, text: `"${cluster}" is hard to pronounce.` }); }

  // Things that are hard to tell someone.
  if (digits > 0) { score -= Math.min(20, 6 + digits * 3); notes.push({ good: false, text: "Numbers are hard to remember and to say (\"two\" or \"2\"?)." }); }
  if (separators > 1) { score -= 8 * (separators - 1); notes.push({ good: false, text: "Several dots or underscores are easy to get wrong." }); }
  else if (separators === 1) notes.push({ good: true, text: "One separator keeps words readable." });
  if (/(.)\1\1/.test(handle)) { score -= 8; notes.push({ good: false, text: "Three of the same letter in a row is easy to mistype." }); }
  if (!isClean(handle)) { score -= 40; notes.push({ good: false, text: "Contains a word some people may find offensive." }); }

  const platforms = Object.keys(LABELS).map(id => platformFit(id, handle));
  const fits = platforms.filter(p => p.ok).length;
  if (fits === platforms.length) notes.push({ good: true, text: "Works as a username on every platform listed." });
  else score -= (platforms.length - fits) * 5;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 85 ? "Great" : score >= 70 ? "Good" : score >= 50 ? "Okay" : "Needs work";
  notes.sort((a, b) => Number(b.good) - Number(a.good));
  return { handle, length: handle.length, syllables, score, verdict, platforms, notes };
}

const BEFORE = ["the", "its", "get", "hey", "real", "hello", "meet"];
const AFTER = ["hq", "official", "studio", "app", "io", "co", "labs", "world", "online", "daily"];

/**
 * Close variations of a name, for when it's taken: "the.name", "name_hq",
 * "getname"… Every one follows the chosen platform's rules. Deterministic, so
 * the same name always gives the same list.
 */
export function variations(raw: string, platformId = "any", count = 12): string[] {
  const p = PLATFORMS[platformId] ?? PLATFORMS.any;
  const handle = toHandle(raw);
  const words = handle.split(/[._-]+/).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  if (words.length === 0) return [];
  const base = words.join("");
  const seps = [p.separator, ...p.allowed.split("").filter(s => s !== p.separator)];
  const out: string[] = [];

  // The same words, joined differently.
  if (words.length > 1) for (const sep of ["", ...seps]) out.push(words.join(sep));
  // A word before or after, with and without a separator.
  for (let i = 0; i < Math.max(BEFORE.length, AFTER.length); i++) {
    if (AFTER[i]) out.push(`${base}${seps[0]}${AFTER[i]}`, `${base}${AFTER[i]}`);
    if (BEFORE[i]) out.push(`${BEFORE[i]}${seps[0]}${base}`, `${BEFORE[i]}${base}`);
  }

  const seen = new Set<string>([handle]);
  return out.filter(v => {
    if (seen.has(v)) return false;
    seen.add(v);
    return v.length >= p.min && v.length <= p.max && p.valid.test(v) && isClean(v);
  }).slice(0, count);
}
