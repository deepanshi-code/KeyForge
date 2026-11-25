import type { Preset } from "../core/presets.ts";
import { findGenerator } from "../core/registry.ts";
import { secureRng } from "../core/rng.ts";

/**
 * Shared helpers for the home screens: a one-off name sampler (used by the
 * Try-it card and the live samples on All tools), and the reduced-motion check.
 */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Forges one name for a preset, using the same generator and options as its card. */
export function forge(preset: Preset): string | null {
  const gen = findGenerator(preset.generatorId);
  if (!gen || gen.sensitive) return null;
  try {
    // Personas are "Name · @handle · email": the name alone fits the anvil.
    return gen.generate({ ...gen.defaults, ...preset.options }, secureRng).split(" · ")[0];
  } catch {
    return null;
  }
}
