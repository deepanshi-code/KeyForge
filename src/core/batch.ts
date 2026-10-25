import type { Rng } from "./rng.ts";
import type { Generator, Options } from "./types.ts";

export interface BatchResult {
  values: string[];
  /** How many fewer unique results we got than requested (small option spaces run out). */
  shortBy: number;
}

/** Generates up to `count` results with no duplicates. */
export function generateBatch<O extends Options>(gen: Generator<O>, opts: O, count: number, rng: Rng): BatchResult {
  const seen = new Set<string>();
  // Give up eventually: e.g. "4-digit minimal usernames" may have fewer
  // combinations than the user asked for.
  const maxAttempts = count * 25;
  for (let i = 0; i < maxAttempts && seen.size < count; i++) {
    seen.add(gen.generate(opts, rng));
  }
  return { values: [...seen], shortBy: count - seen.size };
}
