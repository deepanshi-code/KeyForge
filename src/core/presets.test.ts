import { describe, expect, it } from "vitest";
import { generateBatch } from "./batch.ts";
import { PRESETS } from "./presets.ts";
import { findGenerator } from "./registry.ts";
import { seededRng } from "./rng.ts";
import { validateOptions } from "./validate.ts";

describe("guided-start presets", () => {
  for (const preset of PRESETS) {
    it(`${preset.title}: valid options that generate results`, () => {
      const gen = findGenerator(preset.generatorId);
      expect(gen, `unknown generator ${preset.generatorId}`).toBeDefined();
      const opts = { ...gen!.defaults, ...preset.options };
      // Every option a preset sets must be a real option of that generator.
      for (const key of Object.keys(preset.options)) expect(gen!.fields.some(f => f.key === key), key).toBe(true);
      expect(validateOptions(gen!, opts)).toBeNull();
      expect(generateBatch(gen!, opts, 8, seededRng(preset.id)).values.length).toBeGreaterThan(0);
    });
  }

  it("have unique ids", () => {
    expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
  });
});
