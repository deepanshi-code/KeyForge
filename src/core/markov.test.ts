import { describe, expect, it } from "vitest";
import { MYTHIC_WORDS } from "../data/words.ts";
import { trainModel } from "./markov.ts";
import { seededRng } from "./rng.ts";

describe("Markov word model", () => {
  const model = trainModel(MYTHIC_WORDS);

  it("invents words that are not in the training list", () => {
    const rng = seededRng("markov");
    const training = new Set(MYTHIC_WORDS);
    for (let i = 0; i < 300; i++) {
      const word = model.generate(rng, 4, 8);
      expect(word).not.toBeNull();
      expect(training.has(word!)).toBe(false);
    }
  });

  it("respects length limits and stays pronounceable", () => {
    const rng = seededRng("lengths");
    for (let i = 0; i < 300; i++) {
      const word = model.generate(rng, 5, 7)!;
      expect(word.length).toBeGreaterThanOrEqual(5);
      expect(word.length).toBeLessThanOrEqual(7);
      expect(word).toMatch(/^[a-z]+$/);
      expect(word).not.toMatch(/(.)\1\1/);
      expect(word).not.toMatch(/[^aeiouy]{4}/);
    }
  });

  it("produces variety", () => {
    const rng = seededRng("variety");
    const words = new Set(Array.from({ length: 200 }, () => model.generate(rng, 4, 8)));
    expect(words.size).toBeGreaterThan(150);
  });

  it("only uses letter pairs it learned", () => {
    const tiny = trainModel(["abab", "baba"]);
    const word = tiny.generate(seededRng("tiny"), 1, 6);
    // From these words, nothing but a/b can ever appear.
    if (word) expect(word).toMatch(/^[ab]+$/);
  });

  it("returns null when it can't find a new word", () => {
    // A single training word can only reproduce itself, which is rejected.
    expect(trainModel(["solo"]).generate(seededRng("solo"), 1, 10)).toBeNull();
  });
});
