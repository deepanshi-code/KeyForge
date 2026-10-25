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
