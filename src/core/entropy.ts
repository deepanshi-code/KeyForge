import type { ResultNote } from "./types.ts";

/**
 * Entropy = log2(number of equally likely outputs). For n independent picks
 * from a pool of size k, that's n × log2(k) bits. Each extra bit doubles the
 * guesses an attacker needs.
 */
export function entropyBits(picks: number, poolSize: number): number {
  return picks * Math.log2(poolSize);
}

const LEVELS = [
  { below: 40, label: "Weak" },
  { below: 60, label: "Medium" },
  { below: 80, label: "Strong" },
  { below: Infinity, label: "Very strong" },
] as const;

/** A strength note with a meter: 128 bits or more fills the bar. */
export function strengthNote(bits: number): ResultNote {
  const tone = LEVELS.findIndex(level => bits < level.below) as 0 | 1 | 2 | 3;
  return {
    text: `${LEVELS[tone].label} · ~${Math.round(bits)} bits of entropy`,
    meter: Math.min(bits / 128, 1),
    tone,
  };
}

/** Passwords so common that attackers try them first, whatever their length. */
const COMMON = ["password", "12345678", "123456789", "qwerty", "iloveyou", "admin", "welcome", "letmein", "abc123", "football"];

/**
 * Rough strength of a password a person chose (not one we generated, whose
 * entropy we know exactly). Counts the character types used, then subtracts
 * for the patterns people use most: common passwords, repeats and sequences.
 */
export function chosenPasswordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  const lower = password.toLowerCase();
  if (password.length < 8 || COMMON.some(c => lower.includes(c))) return { score: 0, label: "Weak" };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 32;
  let bits = entropyBits(password.length, pool);
  if (/(.)\1\1/.test(password)) bits -= 10; // "aaa"
  if (/(?:abc|bcd|cde|123|234|345|456|567|678|789)/i.test(password)) bits -= 10; // runs
  if (bits < 40) return { score: 1, label: "Fair" };
  if (bits < 60) return { score: 2, label: "Good" };
  return { score: 3, label: "Strong" };
}
