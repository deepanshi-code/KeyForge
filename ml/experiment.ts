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

// Near-duplicates: test words one edit away from a training word (nebula / nebular)
// make both models look better than they are. Report results without them too.
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return a === b;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
const farIdx = allIdx.filter(i => !train.some(t => withinOneEdit(test[i], t)));
const nearCount = allIdx.length - farIdx.length;
const ngFar = testPpl("ng", farIdx);
const nnFar = testPpl("nn", farIdx);

// Training-seed variance: retrain the chosen setting with more seeds. The bootstrap
// only covers which test words were drawn, not how lucky one training run was.
const seedPpl = [nnTest];
for (const s of [1, 2, 3]) {
  const rng = seededRng(`${SEED}-seed-${s}`);
  const model = new MlpModel(best.cfg, rng);
  model.train(train, rng, { steps: STEPS, batch: 32, lr: 0.1, weightDecay: best.cfg.weightDecay });
  seedPpl.push(perplexity(model, test));
  console.log(`seed ${s}: test perplexity ${seedPpl.at(-1)?.toFixed(3)}`);
}
const seedMean = seedPpl.reduce((a, b) => a + b, 0) / seedPpl.length;
const seedSd = Math.sqrt(seedPpl.reduce((a, b) => a + (b - seedMean) ** 2, 0) / (seedPpl.length - 1));

// ---- 5. What the models generate ----
const pronounceable = (w: string) => !/(.)\1\1/.test(w) && !/[^aeiouy]{4}/.test(w);
const MAX_SAMPLE = 14;
/** Why a sample isn't a usable name. Checked in this order, so each sample gets exactly one reason. */
type Reason = "empty" | "tooShort" | "cutOff" | "tooLong" | "unpronounceable" | "blocked" | "valid";
function reasonFor(w: string): Reason {
  if (w.length === 0) return "empty";
  if (w.length < 4) return "tooShort";
  if (w.length >= MAX_SAMPLE) return "cutOff"; // never reached the end marker
  if (w.length > 10) return "tooLong";
  if (!pronounceable(w)) return "unpronounceable";
  if (!isClean(w)) return "blocked";
  return "valid";
}
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: readonly number[]) => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
function generation(model: CharModel, label: string) {
  const rng = seededRng(`${SEED}-gen-${label}`);
  const samples = Array.from({ length: 1000 }, () => sample(model, rng, MAX_SAMPLE));
  const reasons: Record<Reason, number> = { empty: 0, tooShort: 0, cutOff: 0, tooLong: 0, unpronounceable: 0, blocked: 0, valid: 0 };
  for (const w of samples) reasons[reasonFor(w)]++;
  const valid = samples.filter(w => reasonFor(w) === "valid");
  const validNew = valid.filter(w => !allKnown.has(w));
  // Every rate below is a share of ALL 1,000 samples, so they can be compared directly.
  const share = (n: number) => n / samples.length;
  return {
    reasons,
    validRate: share(valid.length),
    validNewRate: share(validNew.length),
    lengthRejectRate: share(reasons.empty + reasons.tooShort + reasons.cutOff + reasons.tooLong),
    soundRejectRate: share(reasons.unpronounceable + reasons.blocked),
    meanLength: mean(samples.map(w => w.length)),
    sdLength: sd(samples.map(w => w.length)),
    distinctRate: share(new Set(samples).size),
    memorisedRate: share(samples.filter(w => trainSet.has(w)).length),
    examples: [...new Set(validNew)].slice(0, 12),
    failures: [...new Set(samples.filter(w => reasonFor(w) !== "valid"))].slice(0, 8),
  };
}
const genNg = generation(ngram, "ngram");
const genNn = generation(mlp, "mlp");
const pOf = (a: number, b: number) =>
  twoProportionPValue({ shown: 1000, starred: Math.round(a * 1000) }, { shown: 1000, starred: Math.round(b * 1000) }) ?? 1;
const validP = pOf(genNn.validRate, genNg.validRate);
const soundP = pOf(genNn.soundRejectRate, genNg.soundRejectRate);
// How much of the gap in valid samples comes from length vs sound (pronounceability + blocklist)?
const gap = genNn.validRate - genNg.validRate;
const lengthShare = gap !== 0 ? (genNg.lengthRejectRate - genNn.lengthRejectRate) / gap : 0;
const corpusMeanLength = mean(corpus.map(w => w.length));
const corpusSdLength = sd(corpus.map(w => w.length));
const overfitGap = Math.max(...tuning.map(r => r.valPpl - r.trainPpl));
const largest = tuning.reduce((a, b) => (b.trainPpl < a.trainPpl ? b : a));
// For each network size tried with both decays, did the stronger decay validate better?
const pairs = CONFIGS.map((c, i) => ({ c, row: tuning[i] }));
const decayHelped = pairs.filter(p => p.c.weightDecay === 1e-3).every(strong => {
  const weak = pairs.find(p => p.c.weightDecay === 1e-4 && p.c.hidden === strong.c.hidden && p.c.context === strong.c.context);
  return !weak || weak.row.valPpl > strong.row.valPpl;
});

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
| Model | Test perplexity | Without near-duplicates (${farIdx.length} words) |
|---|---|---|
| n-gram baseline | **${ngTest.toFixed(3)}** | ${ngFar.toFixed(3)} |
| Neural MLP | **${nnTest.toFixed(3)}** | ${nnFar.toFixed(3)} |

Difference (n-gram − neural): **${(ngTest - nnTest).toFixed(3)}**, 95% paired-bootstrap interval **[${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]** over ${test.length} test words.
**Verdict:** ${winner === "neither" ? "no reliable difference — the interval includes 0." : `the ${winner} model is better, and the interval excludes 0.`}

- **Training-seed variance:** the chosen neural setting retrained with ${seedPpl.length} seeds gives test perplexity **${seedMean.toFixed(2)} ± ${seedSd.toFixed(2)}** (mean ± SD; range ${Math.min(...seedPpl).toFixed(2)}–${Math.max(...seedPpl).toFixed(2)}). The bootstrap above only covers which test words were drawn, so this is the other half of the uncertainty.
- **Near-duplicates:** ${nearCount} of ${test.length} test words are one edit away from a training word (e.g. *nebula*/*nebular*). Both models score better on those, so the column without them is the fairer absolute number; the comparison between models is similar.

## What they generate (1,000 samples each)
"Valid" = 4–10 letters, pronounceable (no triple letters, no 4 consonants in a row), and passes the blocklist. **Every rate is a share of all 1,000 samples.**

| | n-gram | Neural |
|---|---|---|
| **Valid** | **${pct(genNg.validRate)}** | **${pct(genNn.validRate)}** |
| Valid and not a known word | ${pct(genNg.validNewRate)} | ${pct(genNn.validNewRate)} |
| Rejected: empty | ${pct(genNg.reasons.empty / 1000)} | ${pct(genNn.reasons.empty / 1000)} |
| Rejected: too short (< 4) | ${pct(genNg.reasons.tooShort / 1000)} | ${pct(genNn.reasons.tooShort / 1000)} |
| Rejected: too long (11–13) | ${pct(genNg.reasons.tooLong / 1000)} | ${pct(genNn.reasons.tooLong / 1000)} |
| Rejected: cut off at ${MAX_SAMPLE} letters | ${pct(genNg.reasons.cutOff / 1000)} | ${pct(genNn.reasons.cutOff / 1000)} |
| Rejected: unpronounceable | ${pct(genNg.reasons.unpronounceable / 1000)} | ${pct(genNn.reasons.unpronounceable / 1000)} |
| Rejected: blocklist | ${pct(genNg.reasons.blocked / 1000)} | ${pct(genNn.reasons.blocked / 1000)} |
| Length, mean ± SD (real words: ${corpusMeanLength.toFixed(1)} ± ${corpusSdLength.toFixed(1)}) | ${genNg.meanLength.toFixed(1)} ± ${genNg.sdLength.toFixed(1)} | ${genNn.meanLength.toFixed(1)} ± ${genNn.sdLength.toFixed(1)} |
| Distinct samples | ${pct(genNg.distinctRate)} | ${pct(genNn.distinctRate)} |
| Copied a training word | ${pct(genNg.memorisedRate)} | ${pct(genNn.memorisedRate)} |

Valid-rate difference: two-proportion z-test p = ${validP < 0.0001 ? "< 0.0001" : validP.toFixed(4)}. Sound-based rejections (unpronounceable + blocklist): p = ${soundP < 0.0001 ? "< 0.0001" : soundP.toFixed(4)}.

New words, n-gram: ${genNg.examples.join(", ")}

New words, neural: ${genNn.examples.join(", ")}

## Interpretation (generated from the numbers above)
- **Prediction:** ${winner === "neither" ? "on this small dataset the neural model does not predict unseen words reliably better than a well-tuned n-gram — the honest result is a tie." : `the ${winner} model predicts unseen words better.`}
- **Generation:** the neural model produces ${genNn.validRate > genNg.validRate ? "more" : "fewer"} valid names (${pct(genNn.validRate)} vs ${pct(genNg.validRate)}${validP < 0.05 ? ", a statistically clear difference" : ", not a clear difference"}). **About ${Math.round(lengthShare * 100)}% of that gap comes from word length**: the n-gram stops too early or runs on far more often (${pct(genNg.lengthRejectRate)} vs ${pct(genNn.lengthRejectRate)} rejected for length). The average length is similar, but the n-gram's lengths are much more spread out: SD ${genNg.sdLength.toFixed(1)} vs ${genNn.sdLength.toFixed(1)}, against ${corpusSdLength.toFixed(1)} for real words. Sound-based rejections differ ${soundP < 0.05 ? "too, but they are a small part of the gap" : "only a little, and not clearly"} (${pct(genNg.soundRejectRate)} vs ${pct(genNn.soundRejectRate)}). So the main measured advantage is that the neural model **ends words at more realistic lengths** — its ${best.cfg.context}-letter context sees further back than the n-gram's 2 when deciding to stop. Why exactly isn't tested here.
- **Overfitting:** bigger networks fit the training words far better than unseen ones (gap up to ${overfitGap.toFixed(1)} perplexity points; the largest setting reached train ${largest.trainPpl.toFixed(2)} but validation ${largest.valPpl.toFixed(2)}). Stronger weight decay ${decayHelped ? "gave the better validation score at every size where both were tried" : "did not help consistently"}; the best setting on validation was ${best.cfg.hidden} hidden units with decay ${best.cfg.weightDecay}. More data, not a bigger model, is the fix.
- **Baseline, precisely:** this is a smoothed n-gram sampled *without* filters. The app's own Markov generator (\`src/core/markov.ts\`) is unsmoothed and **rejects** short, long, unpronounceable and blocked words before showing them, so in the app every shown invented word is already valid — the gap above shows how many tries each model needs, not what users see.

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
