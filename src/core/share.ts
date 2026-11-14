/**
 * Shareable shortlists: favourites packed into the part of a link after "#".
 * Browsers never send that part to a server, so sharing still needs no
 * backend and the names stay between you and whoever you send the link to.
 *
 *   https://…/KeyForge/#share=<base64url of JSON>
 *
 * Opening a link only shows the names; nothing is saved until the person
 * chooses to. Incoming data is treated as untrusted: checked, trimmed, capped.
 */
export interface SharedItem {
  generatorId: string;
  value: string;
}

export const SHARE_PREFIX = "share=";
export const SHARE_LIMIT = 30;
const MAX_VALUE_LENGTH = 80;

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

/** The "#share=…" fragment for these items (at most SHARE_LIMIT). */
export function encodeShortlist(items: readonly SharedItem[]): string {
  const compact = items.slice(0, SHARE_LIMIT).map(i => [i.generatorId, i.value]);
  return `${SHARE_PREFIX}${toBase64Url(JSON.stringify({ v: 1, i: compact }))}`;
}

/**
 * Reads a fragment back. Returns null if it isn't a shortlist. Only items for
 * generators that exist and may be shared (`allowed`) are kept.
 */
export function decodeShortlist(fragment: string, allowed: (generatorId: string) => boolean): SharedItem[] | null {
  const hash = fragment.replace(/^#/, "");
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  try {
    const data = JSON.parse(fromBase64Url(hash.slice(SHARE_PREFIX.length))) as { v?: unknown; i?: unknown };
    if (data.v !== 1 || !Array.isArray(data.i)) return null;
    const items: SharedItem[] = [];
    for (const entry of data.i.slice(0, SHARE_LIMIT)) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") continue;
      const value = entry[1].trim().slice(0, MAX_VALUE_LENGTH);
      if (value && allowed(entry[0]) && !items.some(i => i.generatorId === entry[0] && i.value === value)) {
        items.push({ generatorId: entry[0], value });
      }
    }
    return items;
  } catch {
    return null; // corrupted or hand-edited link
  }
}
