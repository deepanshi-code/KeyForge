import { describe, expect, it } from "vitest";
import { generateBatch } from "./batch.ts";
import { seededRng } from "./rng.ts";
import type { Generator } from "./types.ts";

const twoValues: Generator<Record<string, never>> = {
  id: "two",
  name: "Two",
  icon: "2️⃣",
  description: "",
  sensitive: false,
  fields: [],
  defaults: {},
  generate: (_opts, rng) => rng.pick(["a", "b"]),
};

describe("generateBatch", () => {
  it("never returns duplicates", () => {
    const { values } = generateBatch(twoValues, {}, 2, seededRng("batch"));
    expect(new Set(values).size).toBe(values.length);
  });

  it("reports when the option space is too small", () => {
    const result = generateBatch(twoValues, {}, 5, seededRng("batch"));
    expect(result.values.sort()).toEqual(["a", "b"]);
    expect(result.shortBy).toBe(3);
  });
});
