import type { Preset } from "../core/presets.ts";
import { findGenerator } from "../core/registry.ts";
import { secureRng } from "../core/rng.ts";
import { byId, h } from "./dom.ts";

/**
 * The home screen's moving parts, built on the "forge" idea:
 *   - the forge: a real name appears glowing hot, letter by letter, then cools
 *     to steel, throwing a few sparks;
 *   - embers drifting up behind everything.
 * Both are decorative, stop entirely when the system asks for reduced motion,
 * and pause while the tab is hidden or another screen is showing.
 */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

/** Lays the name out as letters that start hot and cool one after another. */
function strike(target: HTMLElement, sparks: HTMLElement, name: string): void {
  target.style.setProperty("--len", String(Math.max(name.length, 10))); // long names get a smaller size, never a line break
  target.replaceChildren(...[...name].map((ch, i) => h("span", { class: "hot", style: `--i:${i}` }, ch)));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const letter of target.children) letter.classList.remove("hot"); // CSS cools each letter, staggered
  }));
  sparks.replaceChildren(...Array.from({ length: 10 }, () => h("i", {
    style: `--x:${secureRng.int(200) - 100}px;--y:${-40 - secureRng.int(70)}px;--d:${300 + secureRng.int(500)}ms;--l:${secureRng.int(100)}%`,
  })));
}

export function startForge(presets: readonly Preset[], isVisible: () => boolean): void {
  const forFor = byId("forgeFor");
  const name = byId("forgeName");
  const meta = byId("forgeMeta");
  const sparks = byId("forgeSparks");
  const shown = presets.filter(p => !findGenerator(p.generatorId)?.sensitive);
  if (reducedMotion() || shown.length === 0) return; // the static first frame stays

  void (async () => {
    for (;;) {
      if (!isVisible() || document.hidden) {
        await wait(500);
        continue;
      }
      const preset = shown[secureRng.int(shown.length)];
      const value = forge(preset);
      if (!value) continue;
      forFor.textContent = preset.title;
      meta.textContent = `${value.length} characters · ${preset.hint.toLowerCase()}`;
      strike(name, sparks, value);
      await wait(3400);
    }
  })();
}

/** Embers: warm specks that drift up, sway and flicker, fading near the top. */
export function startEmbers(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || reducedMotion()) return;
  type Ember = { x: number; y: number; vy: number; sway: number; phase: number; size: number };
  const embers: Ember[] = [];
  let width = 0;
  let height = 0;
  const spawn = (anywhere: boolean): Ember => ({
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : height + 10,
    vy: 0.25 + Math.random() * 0.55,
    sway: 0.3 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
    size: 0.8 + Math.random() * 1.8,
  });

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const wanted = Math.round(Math.min(55, (width * height) / 26_000));
    while (embers.length < wanted) embers.push(spawn(true));
    embers.length = wanted;
  };
  resize();
  window.addEventListener("resize", resize);

  let t = 0;
  const frame = () => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    t += 0.016;
    const dark = getComputedStyle(document.documentElement).colorScheme.includes("dark");
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.y -= e.vy;
      e.x += Math.sin(t * e.sway + e.phase) * 0.35;
      if (e.y < -10) embers[i] = spawn(false);
      const life = Math.max(0, Math.min(1, e.y / height)); // brighter low, fading as they rise
      const flicker = 0.75 + 0.25 * Math.sin(t * 6 + e.phase);
      const alpha = life * flicker * (dark ? 0.85 : 0.5);
      const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 4);
      const tint = i % 3 === 0 ? "34, 211, 238" : "167, 139, 250"; // cyan or violet
      glow.addColorStop(0, `rgba(237, 233, 254, ${alpha})`);
      glow.addColorStop(0.4, `rgba(${tint}, ${alpha * 0.5})`);
      glow.addColorStop(1, `rgba(${tint}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  requestAnimationFrame(frame);
}
