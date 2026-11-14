import type { Rng } from "../core/rng.ts";

/**
 * Character-level language models for invented names, compared fairly:
 *   - NGramModel: the classic baseline (what markov.ts does, plus smoothing so
 *     unseen letter combinations get a small probability instead of zero).
 *   - MlpModel: a small neural network written from scratch — letter
 *     embeddings → tanh hidden layer → softmax over the next letter — trained
 *     with hand-written backpropagation (no ML library).
 * Both predict the next character from the previous ones, so both can be
 * scored with the same metric: perplexity on names they never saw.
 */

/** "." marks both the start padding and the end of a word. */
export const ALPHABET = ".abcdefghijklmnopqrstuvwxyz";
export const VOCAB = ALPHABET.length;
const END = 0;

export const encode = (ch: string) => ALPHABET.indexOf(ch);

/** Lowercase a–z words of a sensible length, without duplicates. */
export function cleanWords(words: readonly string[], min = 3, max = 12): string[] {
  return [...new Set(words.map(w => w.toLowerCase()).filter(w => /^[a-z]+$/.test(w) && w.length >= min && w.length <= max))];
}

/** Deterministic train / validation / test split. */
export function split<T>(items: readonly T[], rng: Rng, fractions = [0.8, 0.1]): { train: T[]; val: T[]; test: T[] } {
  const shuffled = rng.shuffle([...items]);
  const a = Math.round(shuffled.length * fractions[0]);
  const b = a + Math.round(shuffled.length * fractions[1]);
  return { train: shuffled.slice(0, a), val: shuffled.slice(a, b), test: shuffled.slice(b) };
}

export interface CharModel {
  /** Probability distribution over the next character, given everything so far ("" = start). */
  next(prefix: string): Float64Array;
}

/**
 * Perplexity per character (including the end marker): e^(average negative
 * log-likelihood). Lower is better; 27 would be random guessing.
 */
export function perplexity(model: CharModel, words: readonly string[]): number {
  let nll = 0;
  let count = 0;
  for (const word of words) {
    for (let i = 0; i <= word.length; i++) {
      const target = i < word.length ? encode(word[i]) : END;
      nll -= Math.log(Math.max(model.next(word.slice(0, i))[target], 1e-12));
      count++;
    }
  }
  return Math.exp(nll / count);
}

/** Draws a word letter by letter until the end marker (or maxLength). */
export function sample(model: CharModel, rng: Rng, maxLength = 14): string {
  let word = "";
  while (word.length < maxLength) {
    const p = model.next(word);
    let r = rng.int(1_000_000) / 1_000_000;
    let c = 0;
    for (; c < VOCAB - 1; c++) {
      r -= p[c];
      if (r < 0) break;
    }
    if (c === END) break;
    word += ALPHABET[c];
  }
  return word;
}

// ---------------------------------------------------------------------------
// Baseline: interpolated n-gram (Jelinek–Mercer smoothing)
// ---------------------------------------------------------------------------

/**
 * P(c | last two letters) mixed with P(c | last letter) and P(c), with
 * add-k smoothing at each level. The mixing weights are tuned on validation
 * data, which makes this a strong, fair baseline.
 */
export class NGramModel implements CharModel {
  private readonly counts = [new Map<string, Float64Array>(), new Map<string, Float64Array>(), new Map<string, Float64Array>()];
  private readonly lambdas: [number, number, number];
  private readonly k: number;

  constructor(words: readonly string[], lambdas: [number, number, number] = [0.6, 0.3, 0.1], k = 0.1) {
    this.lambdas = lambdas;
    this.k = k;
    for (const word of words) {
      const padded = `..${word}.`;
      for (let i = 2; i < padded.length; i++) {
        const target = encode(padded[i]);
        for (let order = 0; order < 3; order++) {
          const context = padded.slice(i - order, i);
          const row = this.counts[order].get(context) ?? new Float64Array(VOCAB);
          row[target]++;
          this.counts[order].set(context, row);
        }
      }
    }
  }

  private level(order: number, context: string): Float64Array {
    const row = this.counts[order].get(context);
    const p = new Float64Array(VOCAB);
    const total = row ? row.reduce((a, b) => a + b, 0) : 0;
    for (let c = 0; c < VOCAB; c++) p[c] = ((row?.[c] ?? 0) + this.k) / (total + this.k * VOCAB);
    return p;
  }

  next(prefix: string): Float64Array {
    const padded = `..${prefix}`;
    const [l2, l1, l0] = this.lambdas;
    const p2 = this.level(2, padded.slice(-2));
    const p1 = this.level(1, padded.slice(-1));
    const p0 = this.level(0, "");
    const p = new Float64Array(VOCAB);
    for (let c = 0; c < VOCAB; c++) p[c] = l2 * p2[c] + l1 * p1[c] + l0 * p0[c];
    return p;
  }
}

// ---------------------------------------------------------------------------
// Neural model: MLP language model with hand-written backpropagation
// ---------------------------------------------------------------------------

export interface MlpConfig {
  context: number; // how many previous letters it sees
  embed: number;   // size of each letter's learned vector
  hidden: number;  // hidden layer width
}

export interface MlpWeights extends MlpConfig {
  E: number[]; W1: number[]; b1: number[]; W2: number[]; b2: number[];
}

/** Standard normal sample (Box–Muller). */
function gaussian(rng: Rng): number {
  const u = (rng.int(1_000_000) + 1) / 1_000_001;
  const v = (rng.int(1_000_000) + 1) / 1_000_001;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class MlpModel implements CharModel {
  readonly cfg: MlpConfig;
  E: Float64Array;  // [VOCAB × embed]
  W1: Float64Array; // [context·embed × hidden]
  b1: Float64Array; // [hidden]
  W2: Float64Array; // [hidden × VOCAB]
  b2: Float64Array; // [VOCAB]

  constructor(cfg: MlpConfig, rng: Rng) {
    this.cfg = cfg;
    const inputs = cfg.context * cfg.embed;
    const init = (n: number, scale: number) => Float64Array.from({ length: n }, () => gaussian(rng) * scale);
    this.E = init(VOCAB * cfg.embed, 1);
    this.W1 = init(inputs * cfg.hidden, (5 / 3) / Math.sqrt(inputs)); // Kaiming-style for tanh
    this.b1 = new Float64Array(cfg.hidden);
    this.W2 = init(cfg.hidden * VOCAB, 0.1); // small output layer: start near uniform predictions
    this.b2 = new Float64Array(VOCAB);
  }

  static fromWeights(w: MlpWeights): MlpModel {
    const model = Object.create(MlpModel.prototype) as MlpModel;
    Object.assign(model, {
      cfg: { context: w.context, embed: w.embed, hidden: w.hidden },
      E: Float64Array.from(w.E), W1: Float64Array.from(w.W1), b1: Float64Array.from(w.b1),
      W2: Float64Array.from(w.W2), b2: Float64Array.from(w.b2),
    });
    return model;
  }

  toWeights(decimals = 4): MlpWeights {
    const round = (a: Float64Array) => Array.from(a, x => Number(x.toFixed(decimals)));
    return { ...this.cfg, E: round(this.E), W1: round(this.W1), b1: round(this.b1), W2: round(this.W2), b2: round(this.b2) };
  }

  /** The last `context` letters as indices, padded with "." at the start. */
  contextOf(prefix: string): number[] {
    const padded = ".".repeat(this.cfg.context) + prefix;
    return [...padded.slice(-this.cfg.context)].map(encode);
  }

  /** Forward pass for one example; keeps intermediate values for backprop. */
  forward(ctx: readonly number[]) {
    const { embed, hidden } = this.cfg;
    const x = new Float64Array(ctx.length * embed);
    for (const [i, c] of ctx.entries()) x.set(this.E.subarray(c * embed, (c + 1) * embed), i * embed);
    const a = new Float64Array(hidden);
    for (let j = 0; j < hidden; j++) {
      let z = this.b1[j];
      for (let i = 0; i < x.length; i++) z += x[i] * this.W1[i * hidden + j];
      a[j] = Math.tanh(z);
    }
    const logits = new Float64Array(VOCAB);
    for (let c = 0; c < VOCAB; c++) {
      let z = this.b2[c];
      for (let j = 0; j < hidden; j++) z += a[j] * this.W2[j * VOCAB + c];
      logits[c] = z;
    }
    const max = Math.max(...logits);
    const p = logits.map(z => Math.exp(z - max)); // subtract max: numerically stable softmax
    const sum = p.reduce((s, v) => s + v, 0);
    for (let c = 0; c < VOCAB; c++) p[c] /= sum;
    return { x, a, p };
  }

  next(prefix: string): Float64Array {
    return this.forward(this.contextOf(prefix)).p;
  }

  /**
   * Average cross-entropy over a batch, and (if `grads` is given) adds the
   * gradients into it. Weight decay keeps weights small (less overfitting).
   */
  loss(batch: readonly { ctx: number[]; y: number }[], weightDecay = 0, grads?: Gradients): number {
    const { embed, hidden } = this.cfg;
    let total = 0;
    for (const { ctx, y } of batch) {
      const { x, a, p } = this.forward(ctx);
      total -= Math.log(Math.max(p[y], 1e-12));
      if (!grads) continue;
      // Softmax + cross-entropy: d(loss)/d(logits) = p − onehot(y).
      const dlogits = Float64Array.from(p, (v, c) => (v - (c === y ? 1 : 0)) / batch.length);
      const da = new Float64Array(hidden);
      for (let j = 0; j < hidden; j++) {
        for (let c = 0; c < VOCAB; c++) {
          grads.W2[j * VOCAB + c] += a[j] * dlogits[c];
          da[j] += this.W2[j * VOCAB + c] * dlogits[c];
        }
      }
      for (let c = 0; c < VOCAB; c++) grads.b2[c] += dlogits[c];
      const dz = Float64Array.from(da, (d, j) => d * (1 - a[j] * a[j])); // tanh' = 1 − tanh²
      const dx = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) {
        for (let j = 0; j < hidden; j++) {
          grads.W1[i * hidden + j] += x[i] * dz[j];
          dx[i] += this.W1[i * hidden + j] * dz[j];
        }
      }
      for (let j = 0; j < hidden; j++) grads.b1[j] += dz[j];
      ctx.forEach((c, i) => {
        for (let d = 0; d < embed; d++) grads.E[c * embed + d] += dx[i * embed + d];
      });
    }
    let decay = 0;
    if (weightDecay > 0) {
      for (const [w, g] of [[this.W1, grads?.W1], [this.W2, grads?.W2]] as const) {
        for (let i = 0; i < w.length; i++) {
          decay += 0.5 * weightDecay * w[i] * w[i];
          if (g) g[i] += weightDecay * w[i];
        }
      }
    }
    return total / batch.length + decay;
  }

  /** Every training example: (previous letters → next letter), including the end marker. */
  examples(words: readonly string[]): { ctx: number[]; y: number }[] {
    const out: { ctx: number[]; y: number }[] = [];
    for (const word of words) {
      for (let i = 0; i <= word.length; i++) {
        out.push({ ctx: this.contextOf(word.slice(0, i)), y: i < word.length ? encode(word[i]) : END });
      }
    }
    return out;
  }

  /** Mini-batch gradient descent with a step-decayed learning rate. */
  train(words: readonly string[], rng: Rng, opts = { steps: 6000, batch: 32, lr: 0.1, weightDecay: 1e-4 }): number[] {
    const data = this.examples(words);
    const history: number[] = [];
    for (let step = 0; step < opts.steps; step++) {
      const batch = Array.from({ length: opts.batch }, () => data[rng.int(data.length)]);
      const grads = zeroGradients(this);
      history.push(this.loss(batch, opts.weightDecay, grads));
      const lr = step < opts.steps * 0.7 ? opts.lr : opts.lr / 10; // smaller steps at the end
      for (const key of PARAMS) {
        const w = this[key];
        const g = grads[key];
        for (let i = 0; i < w.length; i++) w[i] -= lr * g[i];
      }
    }
    return history;
  }
}

export const PARAMS = ["E", "W1", "b1", "W2", "b2"] as const;
export type Gradients = Record<(typeof PARAMS)[number], Float64Array>;

export function zeroGradients(model: MlpModel): Gradients {
  return {
    E: new Float64Array(model.E.length), W1: new Float64Array(model.W1.length), b1: new Float64Array(model.b1.length),
    W2: new Float64Array(model.W2.length), b2: new Float64Array(model.b2.length),
  };
}
