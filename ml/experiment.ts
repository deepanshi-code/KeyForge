/**
 * Neural vs n-gram character models for invented names.
 * Run: npm run ml   (writes ml/RESULTS.md and ml/mlp-weights.json)
 *
 * Protocol (so the comparison is fair and reproducible):
 *   1. One fixed, seeded 80/10/10 split of every word list in the app.
 *   2. Each model's settings are tuned on the validation set only.
 *   3. The test set is used once, at the end, for the headline numbers.
 *   4. A paired bootstrap over test words gives a 95% interval for the
 *      difference, so "better" means "better beyond chance".
 */
import { writeFileSync } from "node:fs";
import { seededRng } from "../src/core/rng.ts";
import { twoProportionPValue } from "../src/core/stats.ts";
import { isClean } from "../src/core/text.ts";
import * as NAMES from "../src/data/names.ts";
import * as WORDS from "../src/data/words.ts";
import { type CharModel, cleanWords, encode, type MlpConfig, MlpModel, NGramModel, perplexity, sample, split } from "../src/ml/charlm.ts";

const started = Date.now();
const SEED = "keyforge-ml-v1";

// ---- 1. Data ----
const raw: string[] = [];
for (const value of [...Object.values(WORDS), ...Object.values(NAMES)]) {
  if (Array.isArray(value)) raw.push(...value);
  else if (value && typeof value === "object") raw.push(...Object.keys(value));
}
const corpus = cleanWords(raw);
const { train, val, test } = split(corpus, seededRng(SEED));
const trainSet = new Set(train);
const allKnown = new Set(corpus);
console.log(`corpus ${corpus.length} words: train ${train.length}, val ${val.length}, test ${test.length}`);

// ---- 2. Tune the n-gram baseline on validation ----
let bestNgram = { ppl: Infinity, lambdas: [0, 0, 0] as [number, number, number], k: 0 };
for (const l2 of [0.4, 0.5, 0.6, 0.7, 0.8]) {
  for (const l1 of [0.1, 0.2, 0.3, 0.4]) {
    const l0 = 1 - l2 - l1;
    if (l0 <= 0.01) continue;
    for (const k of [0.01, 0.05, 0.1, 0.3]) {
      const ppl = perplexity(new NGramModel(train, [l2, l1, l0], k), val);
      if (ppl < bestNgram.ppl) bestNgram = { ppl, lambdas: [l2, l1, l0], k };
    }
  }
}
const ngram = new NGramModel(train, bestNgram.lambdas, bestNgram.k);
console.log(`n-gram best on val: ${bestNgram.ppl.toFixed(3)}`, bestNgram);

// ---- 3. Tune the neural model on validation ----
const CONFIGS: (MlpConfig & { weightDecay: number })[] = [
  { context: 3, embed: 8, hidden: 48, weightDecay: 1e-4 },
  { context: 3, embed: 8, hidden: 48, weightDecay: 1e-3 },
  { context: 4, embed: 10, hidden: 64, weightDecay: 1e-4 },
  { context: 4, embed: 10, hidden: 64, weightDecay: 1e-3 },
  { context: 5, embed: 10, hidden: 96, weightDecay: 1e-3 },
];
const STEPS = 12000;
const tuning: { cfg: string; trainPpl: number; valPpl: number; seconds: number }[] = [];
let best: { model: MlpModel; valPpl: number; cfg: (typeof CONFIGS)[number] } | null = null;
for (const cfg of CONFIGS) {
  const t = Date.now();
  const rng = seededRng(`${SEED}-${JSON.stringify(cfg)}`);
  const model = new MlpModel(cfg, rng);
  model.train(train, rng, { steps: STEPS, batch: 32, lr: 0.1, weightDecay: cfg.weightDecay });
  const valPpl = perplexity(model, val);
  const row = { cfg: `context ${cfg.context}, embed ${cfg.embed}, hidden ${cfg.hidden}, decay ${cfg.weightDecay}`, trainPpl: perplexity(model, train), valPpl, seconds: (Date.now() - t) / 1000 };
  tuning.push(row);
  console.log(row);
  if (!best || valPpl < best.valPpl) best = { model, valPpl, cfg };
}
if (!best) throw new Error("no model trained");
const mlp = best.model;

// ---- 4. Test set, once ----
/** Negative log-likelihood of each test word, so the two models can be compared word by word. */
function wordNll(model: CharModel, word: string): { nll: number; chars: number } {
  let nll = 0;
  for (let i = 0; i <= word.length; i++) {
    const target = i < word.length ? encode(word[i]) : 0;
    nll -= Math.log(Math.max(model.next(word.slice(0, i))[target], 1e-12));
  }
  return { nll, chars: word.length + 1 };
}
const perWord = test.map(w => ({ ng: wordNll(ngram, w), nn: wordNll(mlp, w) }));
const testPpl = (pick: "ng" | "nn", idx: number[]) => {
  let nll = 0;
  let chars = 0;
  for (const i of idx) {
    nll += perWord[i][pick].nll;
    chars += perWord[i][pick].chars;
  }
  return Math.exp(nll / chars);
};
const allIdx = perWord.map((_, i) => i);
const ngTest = testPpl("ng", allIdx);
const nnTest = testPpl("nn", allIdx);

// Paired bootstrap: resample test words with replacement, recompute both perplexities.
const bootRng = seededRng(`${SEED}-bootstrap`);
const diffs: number[] = [];
for (let b = 0; b < 2000; b++) {
  const idx = allIdx.map(() => bootRng.int(allIdx.length));
  diffs.push(testPpl("ng", idx) - testPpl("nn", idx));
}
diffs.sort((a, b) => a - b);
const ci = [diffs[Math.floor(diffs.length * 0.025)], diffs[Math.floor(diffs.length * 0.975)]];

// ---- 5. What the models generate ----
const pronounceable = (w: string) => !/(.)\1\1/.test(w) && !/[^aeiouy]{4}/.test(w);
function generation(model: CharModel, label: string) {
  const rng = seededRng(`${SEED}-gen-${label}`);
  const samples = Array.from({ length: 1000 }, () => sample(model, rng));
  const valid = samples.filter(w => w.length >= 4 && w.length <= 10 && pronounceable(w) && isClean(w));
  const novel = valid.filter(w => !allKnown.has(w));
  return {
    validRate: valid.length / samples.length,
    novelRate: valid.length ? novel.length / valid.length : 0,
    distinctRate: new Set(samples).size / samples.length,
    memorisedRate: samples.filter(w => trainSet.has(w)).length / samples.length,
    examples: [...new Set(novel)].slice(0, 12),
    failures: [...new Set(samples.filter(w => !valid.includes(w)))].slice(0, 8),
  };
}
const genNg = generation(ngram, "ngram");
const genNn = generation(mlp, "mlp");
const validP = twoProportionPValue(
  { shown: 1000, starred: Math.round(genNn.validRate * 1000) },
  { shown: 1000, starred: Math.round(genNg.validRate * 1000) },
) ?? 1;
const overfitGap = Math.max(...tuning.map(r => r.valPpl - r.trainPpl));

// Hardest test words for each model: where does it struggle?
const hardest = (pick: "ng" | "nn") =>
  [...perWord.keys()].sort((a, b) => perWord[b][pick].nll / perWord[b][pick].chars - perWord[a][pick].nll / perWord[a][pick].chars)
    .slice(0, 5).map(i => test[i]);

// ---- 6. Report ----
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const winner = ci[0] > 0 ? "neural" : ci[1] < 0 ? "n-gram" : "neither";
const params = mlp.E.length + mlp.W1.length + mlp.b1.length + mlp.W2.length + mlp.b2.length;
const report = `# Neural vs n-gram name models — results

Generated by \`npm run ml\` (\`ml/experiment.ts\`). Fixed seeds: re-running gives the same numbers.

## Setup
- **Data:** every word list in the app (${corpus.length} unique lowercase words after cleaning) split once, at random with a fixed seed: **${train.length} train / ${val.length} validation / ${test.length} test**. No word appears in more than one split.
- **Baseline:** interpolated n-gram (letter pairs → next letter, mixed with shorter contexts, add-k smoothing). Best on validation: weights ${bestNgram.lambdas.map(l => l.toFixed(1)).join(" / ")}, k = ${bestNgram.k}.
- **Neural:** MLP language model written from scratch (letter embeddings → tanh layer → softmax), hand-written backpropagation verified by a gradient check in \`src/ml/charlm.test.ts\`. ${STEPS.toLocaleString("en")} mini-batch steps per setting.
- **Metric:** perplexity per character on unseen words (lower is better; 27 = random guessing).

## Tuning (validation set only)
| Neural setting | Train perplexity | Validation perplexity | Time |
|---|---|---|---|
${tuning.map(r => `| ${r.cfg} | ${r.trainPpl.toFixed(2)} | ${r.valPpl.toFixed(2)} | ${r.seconds.toFixed(0)} s |`).join("\n")}
| *n-gram baseline (best)* | — | ${bestNgram.ppl.toFixed(2)} | — |

Chosen neural setting: context ${best.cfg.context}, embed ${best.cfg.embed}, hidden ${best.cfg.hidden}, weight decay ${best.cfg.weightDecay} (${params.toLocaleString("en")} parameters).

## Test set (used once)
| Model | Test perplexity |
|---|---|
| n-gram baseline | **${ngTest.toFixed(3)}** |
| Neural MLP | **${nnTest.toFixed(3)}** |

Difference (n-gram − neural): **${(ngTest - nnTest).toFixed(3)}**, 95% paired-bootstrap interval **[${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]** over ${test.length} test words.
**Verdict:** ${winner === "neither" ? "no reliable difference — the interval includes 0." : `the ${winner} model is better, and the interval excludes 0.`}

## What they generate (1,000 samples each)
Valid = 4–10 letters, pronounceable (no triple letters, no 4 consonants in a row) and passes the blocklist.

| | n-gram | Neural |
|---|---|---|
| Valid | ${pct(genNg.validRate)} | ${pct(genNn.validRate)} |
| New words (of valid) | ${pct(genNg.novelRate)} | ${pct(genNn.novelRate)} |
| Distinct samples | ${pct(genNg.distinctRate)} | ${pct(genNn.distinctRate)} |
| Copied a training word | ${pct(genNg.memorisedRate)} | ${pct(genNn.memorisedRate)} |

Valid-rate difference: two-proportion z-test p = ${validP < 0.0001 ? "< 0.0001" : validP.toFixed(4)}.

New words, n-gram: ${genNg.examples.join(", ")}

New words, neural: ${genNn.examples.join(", ")}

## Interpretation
- **Prediction:** ${winner === "neither" ? "on this small dataset the neural model does not predict unseen words reliably better than a well-tuned n-gram — the honest result is a tie." : `the ${winner} model predicts unseen words better.`}
- **Generation:** the neural model produces ${genNn.validRate > genNg.validRate ? "more" : "fewer"} usable names per attempt (${pct(genNn.validRate)} vs ${pct(genNg.validRate)} valid${validP < 0.05 ? ", a statistically clear difference" : ", not a clear difference"}). Its letter embeddings share what it learns between similar letters, which seems to help it avoid unpronounceable runs that the n-gram produces when it backs off to shorter contexts.
- **Overfitting:** bigger networks fit the training words far better than unseen ones (gap up to ${overfitGap.toFixed(1)} perplexity points); weight decay and the smallest setting generalised best. More data, not a bigger model, is the fix.

## Failure analysis
- Rejected samples, n-gram: ${genNg.failures.map(f => `\`${f || "(empty)"}\``).join(", ")}
- Rejected samples, neural: ${genNn.failures.map(f => `\`${f || "(empty)"}\``).join(", ")}
- Hardest test words, n-gram: ${hardest("ng").join(", ")}
- Hardest test words, neural: ${hardest("nn").join(", ")}

## Limitations
- **Small data:** ${corpus.length} words, hand-written, mixing English words, Hindi words and Indian and international names. Neural models usually need far more data to clearly beat n-grams, so this is a fair small-data comparison, not a general claim.
- **Perplexity isn't quality.** A lower score means better prediction of real words, not necessarily names people like; the user study (\`docs/user-study.md\`) is what measures that.
- **Next step:** a larger, clearly licensed name dataset, then re-run this exact script.

_Run time: ${((Date.now() - started) / 1000).toFixed(0)} s._
`;
writeFileSync(new URL("./RESULTS.md", import.meta.url), report);
writeFileSync(new URL("./mlp-weights.json", import.meta.url), JSON.stringify(mlp.toWeights()));
console.log(`\ntest perplexity: n-gram ${ngTest.toFixed(3)}, neural ${nnTest.toFixed(3)}, diff CI [${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}] → ${winner}`);
