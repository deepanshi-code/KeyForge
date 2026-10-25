/**
 * Substrings that must never appear in generated names. Generators combine
 * clean words, but joins (and user-typed names) can still produce bad output,
 * so results containing any of these are thrown away and regenerated.
 *
 * Deliberately short and substring-based; it is a safety net, not a full
 * moderation system. Words that cause false positives in normal English
 * (e.g. "ass" in "class") are left out.
 */
export const BLOCKLIST: readonly string[] = [
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "slut", "whore",
  "porn", "rape", "nazi", "hitler", "nigg", "fag", "retard", "kill",
];

/**
 * Innocent words that contain a blocked substring (the "Scunthorpe problem"):
 * the Indian name "Ishita" contains "shit". These are removed before checking.
 */
export const ALLOWLIST: readonly string[] = [
  "ishita", "kshitij", "lakshit", "skill", "peacock", "hancock", "dickens", "shitake", "scunthorpe",
];
