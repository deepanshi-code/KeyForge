/**
 * A simple generated logo for any name: initials on a gradient shape. The
 * same name always gets the same logo (colours and shape come from a hash of
 * the name), and "Try another style" steps through variations.
 *
 * Built with real SVG elements and textContent, never HTML strings, so a name
 * can't inject markup. Downloads as SVG or PNG.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** FNV-1a: a stable number from the name. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Words in a name, whatever its style: "FormSaathi", "form-saathi", "vesper_flux". */
export function nameWords(name: string): string[] {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/** One or two letters: "Form Saathi" → "FS", "vesper" → "Ve". */
export function initials(name: string): string {
  const words = nameWords(name);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase() + (words[0].charAt(1) || "").toLowerCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/** Human-friendly display form: "vesper_flux" → "Vesper Flux". */
export function displayName(name: string): string {
  return nameWords(name).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || name;
}

const SHAPES = ["squircle", "circle", "hexagon", "shield"] as const;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function shapePath(shape: (typeof SHAPES)[number]): SVGElement {
  switch (shape) {
    case "circle":
      return el("circle", { cx: 128, cy: 128, r: 120 });
    case "hexagon":
      return el("path", { d: "M128 8 232 68v120L128 248 24 188V68Z" });
    case "shield":
      return el("path", { d: "M128 8 228 40v76c0 66-42 112-100 132C70 228 28 182 28 116V40Z" });
    default:
      return el("rect", { x: 8, y: 8, width: 240, height: 240, rx: 64 });
  }
}

/** The logo as an <svg> element (256×256 viewBox). `variant` cycles colours and shapes. */
export function logoSvg(name: string, variant = 0): SVGSVGElement {
  const h = hash(`${name}#${variant}`);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h >> 9) % 60) % 360;
  const shape = SHAPES[(h >> 3) % SHAPES.length];
  const id = `g${h.toString(36)}`;

  const svg = el("svg", { xmlns: SVG_NS, viewBox: "0 0 256 256", width: 256, height: 256, role: "img" });
  svg.setAttribute("aria-label", `Logo for ${name}`);
  const defs = el("defs", {});
  const grad = el("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 1 });
  grad.append(
    el("stop", { offset: 0, "stop-color": `hsl(${hue} 80% 58%)` }),
    el("stop", { offset: 1, "stop-color": `hsl(${hue2} 75% 42%)` }),
  );
  defs.append(grad);
  const body = shapePath(shape);
  body.setAttribute("fill", `url(#${id})`);
  // A soft highlight across the top makes it read as a finished icon, not a flat shape.
  const shine = shapePath(shape);
  shine.setAttribute("fill", "#fff");
  shine.setAttribute("opacity", "0.12");
  shine.setAttribute("transform", "translate(0 -6) scale(1 0.55)");
  const text = el("text", {
    x: 128, y: 128, "text-anchor": "middle", "dominant-baseline": "central",
    "font-family": "Inter, Segoe UI, system-ui, sans-serif", "font-weight": 800,
    "font-size": initials(name).length > 1 ? 104 : 128, "letter-spacing": -4, fill: "#fff",
  });
  text.textContent = initials(name);
  svg.append(defs, body, shine, text);
  return svg;
}

function download(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const fileBase = (name: string) => `keyforge-logo-${nameWords(name).join("-").toLowerCase() || "name"}`;

export function downloadSvg(name: string, variant: number): void {
  const source = new XMLSerializer().serializeToString(logoSvg(name, variant));
  download(new Blob([source], { type: "image/svg+xml" }), `${fileBase(name)}.svg`);
}

/** Draws the SVG onto a canvas and saves it as a 512×512 PNG. */
export async function downloadPng(name: string, variant: number): Promise<void> {
  const source = new XMLSerializer().serializeToString(logoSvg(name, variant));
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    canvas.getContext("2d")?.drawImage(img, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (blob) download(blob, `${fileBase(name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
