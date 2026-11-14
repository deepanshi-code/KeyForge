import { describe, expect, it } from "vitest";
import { seededRng } from "../core/rng.ts";
import { type CharModel, cleanWords, MlpModel, NGramModel, PARAMS, perplexity, sample, split, VOCAB, zeroGradients } from "./charlm.ts";

const WORDS = ["nova", "lyra", "astra", "lumen", "orion", "vega", "luna", "nyra", "selene", "aurora", "lyric", "noval"];

describe("data", () => {
  it("keeps lowercase a–z words of a sensible length, once each", () => {
    expect(cleanWords(["Nova", "nova", "x", "o'neil", "astra"])).toEqual(["nova", "astra"]);
  });

  it("splits without overlap, the same way every time", () => {
    const a = split(cleanWords(WORDS), seededRng("split"));
    const b = split(cleanWords(WORDS), seededRng("split"));
    expect(a).toEqual(b);
    const all = [...a.train, ...a.val, ...a.test];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("models give proper probability distributions", () => {
  const models: [string, CharModel][] = [
    ["n-gram", new NGramModel(WORDS)],
    ["mlp", new MlpModel({ context: 3, embed: 4, hidden: 8 }, seededRng("init"))],
  ];
  for (const [name, model] of models) {
    it(`${name}: probabilities sum to 1 and are never zero`, () => {
      for (const prefix of ["", "n", "no", "zzq"]) {
        const p = model.next(prefix);
        expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        expect(Math.min(...p)).toBeGreaterThan(0);
      }
    });
  }

  it("a model that knows nothing has perplexity 27 (one of 27 symbols)", () => {
    const uniform: CharModel = { next: () => new Float64Array(VOCAB).fill(1 / VOCAB) };
    expect(perplexity(uniform, WORDS)).toBeCloseTo(VOCAB, 6);
  });
});

describe("neural model", () => {
  it("backpropagation matches numerical gradients (gradient check)", () => {
    const model = new MlpModel({ context: 2, embed: 3, hidden: 5 }, seededRng("grad"));
    const batch = model.examples(["nova", "lyra"]);
    const grads = zeroGradients(model);
    model.loss(batch, 1e-3, grads);
    const eps = 1e-6;
    let worst = 0;
    for (const key of PARAMS) {
      const w = model[key];
      for (let i = 0; i < w.length; i += Math.max(1, Math.floor(w.length / 7))) {
        const saved = w[i];
        w[i] = saved + eps;
        const up = model.loss(batch, 1e-3);
        w[i] = saved - eps;
        const down = model.loss(batch, 1e-3);
        w[i] = saved;
        const numeric = (up - down) / (2 * eps);
        const relative = Math.abs(numeric - grads[key][i]) / Math.max(1e-8, Math.abs(numeric) + Math.abs(grads[key][i]));
        worst = Math.max(worst, relative);
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("training lowers the loss and learns the training words", () => {
    const rng = seededRng("train");
    const model = new MlpModel({ context: 3, embed: 6, hidden: 24 }, rng);
    const before = perplexity(model, WORDS);
    const history = model.train(WORDS, rng, { steps: 1500, batch: 16, lr: 0.2, weightDecay: 0 });
    expect(history.at(-1)!).toBeLessThan(history[0]);
    expect(perplexity(model, WORDS)).toBeLessThan(before / 2);
  });

  it("saves and loads its weights", () => {
    const model = new MlpModel({ context: 3, embed: 4, hidden: 8 }, seededRng("save"));
    const loaded = MlpModel.fromWeights(model.toWeights(10));
    expect(Array.from(loaded.next("no"))).toEqual(Array.from(model.next("no")).map(p => expect.closeTo(p, 8)));
  });

  it("samples words made of a–z", () => {
    const model = new NGramModel(WORDS);
    const rng = seededRng("sample");
    for (let i = 0; i < 50; i++) expect(sample(model, rng)).toMatch(/^[a-z]*$/);
  });
});
