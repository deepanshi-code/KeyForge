/** Tiny element builder: h("button", { class: "btn" }, "Copy"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) el.setAttribute(name, value);
  }
  el.append(...children);
  return el;
}

/** getElementById that fails loudly if the HTML and code disagree. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/**
 * Copies text; resolves to whether it worked. The Clipboard API only exists on
 * HTTPS/localhost and can be blocked in embedded frames, so fall back to the
 * older select-and-copy method.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h("textarea", { readonly: "", style: "position:fixed;opacity:0;pointer-events:none" });
    area.value = text;
    document.body.append(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
