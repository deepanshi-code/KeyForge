import { describe, expect, it } from "vitest";
import { GENERATORS } from "../core/registry.ts";
import { seededRng } from "../core/rng.ts";
import { isClean } from "../core/text.ts";
import { validateOptions } from "../core/validate.ts";

// Every registered generator must pass these checks. A new generator gets
// them for free just by being added to the registry.

it("generator ids are unique", () => {
  const ids = GENERATORS.map(g => g.id);
  expect(new Set(ids).size).toBe(ids.length);
});

describe.each(GENERATORS.map(g => [g.name, g] as const))("%s", (_name, gen) => {
  it("has a default for every field", () => {
    for (const field of gen.fields) expect(gen.defaults).toHaveProperty(field.key);
  });

  it("has valid defaults", () => {
    expect(validateOptions(gen, gen.defaults)).toBeNull();
  });

  it("produces non-empty, clean output with default options", () => {
    const rng = seededRng(gen.id);
    for (let i = 0; i < 300; i++) {
      const value = gen.generate(gen.defaults, rng);
      expect(value.length).toBeGreaterThan(0);
      if (!gen.sensitive) expect(isClean(value)).toBe(true);
    }
  });

  it("works with every select choice", () => {
    for (const field of gen.fields) {
      if (field.kind !== "select") continue;
      for (const choice of field.choices) {
        const opts = { ...gen.defaults, [field.key]: choice.value };
        expect(validateOptions(gen, opts)).toBeNull();
        expect(gen.generate(opts, seededRng(choice.value)).length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects out-of-range numbers", () => {
    for (const field of gen.fields) {
      if (field.kind !== "number") continue;
      for (const bad of [field.min - 1, field.max + 1, field.min + 0.5]) {
        expect(validateOptions(gen, { ...gen.defaults, [field.key]: bad })).toMatch(/whole number/);
      }
    }
  });
});
