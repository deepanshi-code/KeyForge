import type { Library } from "../core/library.ts";
import { findGenerator } from "../core/registry.ts";
import { encodeShortlist, SHARE_LIMIT } from "../core/share.ts";
import { ALPHA, analyse, MIN_BATCHES, type Stats, wilsonInterval } from "../core/stats.ts";
import { byId, copyText, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

type Tab = "favourites" | "history" | "insights";

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/** The "Saved" slide-out drawer: favourites, history and insights tabs, plus export/import/clear. */
export function setupLibraryDrawer(
  library: Library,
  stats: Stats,
  onChange: () => void,
  /** Told about every star toggled in the drawer, so Insights can credit it like a star on the results. */
  onFavouriteToggled: (generatorId: string, value: string, nowFavourite: boolean) => void = () => {},
) {
  const drawer = byId("libraryDrawer");
  const overlay = byId("drawerOverlay");
  const openButton = byId<HTMLButtonElement>("libraryBtn");
  const closeButton = byId<HTMLButtonElement>("drawerClose");
  const list = byId<HTMLUListElement>("libList");
  const badge = byId("savedCount");
  const tabs = [...drawer.querySelectorAll<HTMLButtonElement>(".tab")];
  const fileInput = byId<HTMLInputElement>("importFile");
  let tab: Tab = "favourites";

  function open(): void {
    drawer.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => document.body.classList.add("drawer-open"));
    openButton.setAttribute("aria-expanded", "true");
    closeButton.focus();
  }

  function close(): void {
    document.body.classList.remove("drawer-open");
    openButton.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      drawer.hidden = true;
      overlay.hidden = true;
    }, 250);
    openButton.focus();
  }

  const isOpen = () => !drawer.hidden;

  /** Compares star rates of taste picks and random picks shown side by side — evidence, not a claim. */
  function renderInsights(): void {
    const a = analyse(stats.batches());
    const range = (c: typeof a.taste) => {
      if (c.shown === 0) return "no data yet";
      const [low, high] = wilsonInterval(c.starred, c.shown);
      return `${c.starred} of ${c.shown} · likely ${percent(low)}–${percent(high)}`;
    };
    const card = (label: string, c: typeof a.taste) =>
      h("div", { class: "stat-card" },
        h("span", { class: "stat-label" }, label),
        h("span", { class: "stat-value" }, percent(c.rate)),
        h("span", { class: "muted small" }, range(c)),
      );

    const points = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} points`;
    const gap = a.meanDiff === null ? "" : ` Average gap per batch: ${points(a.meanDiff)}${a.diffInterval
      ? ` (95% range ${points(a.diffInterval[0])} to ${points(a.diffInterval[1])})` : ""}.`;
    const verdicts: Record<typeof a.verdict, string> = {
      "not-enough-data": `Not enough data yet: ${a.batches} of ${MIN_BATCHES} batches measured. A batch counts once it has stayed on screen, so keep looking through results and starring the names you genuinely like.`,
      "taste-better": `Taste learning is working: in batch after batch you star taste picks more often than random ones (p = ${a.pValue?.toFixed(4)}).${gap}`,
      "random-better": `Random picks are getting more stars, batch after batch (p = ${a.pValue?.toFixed(4)}). Taste learning isn't helping for you yet.${gap}`,
      "no-clear-difference": `No clear difference yet (p = ${a.pValue?.toFixed(2)}). The gap could still be luck, so keep going.${gap}`,
    };

    list.replaceChildren(h("li", { class: "insights" },
      h("p", { class: "muted small" },
        "A fair test: every taste-learning batch secretly mixes the best matches with a few names picked at random " +
        "from the same candidates, in shuffled order. Explanations only appear after you star a name, so you can't " +
        "tell the two apart. If learning works, you'll star the taste picks more often."),
      h("div", { class: "stat-grid" }, card("Taste picks starred", a.taste), card("Random picks starred", a.random)),
      h("p", { class: "verdict" }, verdicts[a.verdict]),
      h("p", { class: "muted small" },
        `${a.batches} batches measured${a.rankerBatches > 0 ? ` (${a.rankerBatches} ranked using your skips too)` : ""}. ` +
        "The verdict compares taste and random picks within each batch (a sign-flip permutation test) and needs " +
        `p < ${ALPHA} — stricter than usual, because this panel is checked again and again. "Likely" is a 95% range (Wilson interval).`),
    ));
  }

  function render(): void {
    const favourites = library.favourites();
    badge.textContent = String(favourites.length);
    badge.hidden = favourites.length === 0;
    for (const t of tabs) t.setAttribute("aria-pressed", String(t.dataset.tab === tab));
    byId("exportBtn").hidden = tab === "insights";
    byId("shareBtn").hidden = tab !== "favourites" || favourites.length === 0;
    byId("importBtn").hidden = tab === "insights";

    if (tab === "insights") {
      renderInsights();
      return;
    }

    const items = tab === "favourites" ? favourites : library.history();
    if (items.length === 0) {
      const hint = tab === "favourites" ? "Star a result to save it here." : "Names you generate show up here.";
      list.replaceChildren(h("li", { class: "empty" }, icon(tab === "favourites" ? "star" : "clock"), hint));
      return;
    }

    list.replaceChildren(...items.map(item => {
      const gen = findGenerator(item.generatorId);
      const copy = h("button", { type: "button", class: "lib-copy", "aria-label": `Copy ${item.value}` },
        h("span", { class: "lib-value" }, item.value),
        h("span", { class: "lib-meta" }, gen?.name ?? item.generatorId),
      );
      copy.addEventListener("click", async () => {
        const ok = await copyText(item.value);
        toast(ok ? `Copied “${item.value}”` : "Couldn't copy — try selecting it", ok ? "info" : "error");
      });

      const starred = library.isFavourite(item.generatorId, item.value);
      const star = h("button", {
        type: "button", class: "icon-btn star", "aria-pressed": String(starred),
        "aria-label": starred ? `Remove ${item.value} from favourites` : `Add ${item.value} to favourites`,
      }, icon("star", starred));
      star.addEventListener("click", () => {
        onFavouriteToggled(item.generatorId, item.value, library.toggleFavourite(item.generatorId, item.value));
        onChange();
      });
      return h("li", { class: "lib-item" }, copy, star);
    }));
  }

  openButton.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isOpen()) close();
  });

  for (const t of tabs) {
    t.addEventListener("click", () => {
      tab = (t.dataset.tab as Tab | undefined) ?? "favourites";
      render();
    });
  }

  byId("shareBtn").addEventListener("click", async () => {
    const favourites = library.favourites();
    const link = `${location.origin}${location.pathname}#${encodeShortlist(favourites)}`;
    const ok = await copyText(link);
    const n = Math.min(favourites.length, SHARE_LIMIT);
    toast(ok ? `Link copied: it shows ${n} name${n === 1 ? "" : "s"} to whoever opens it` : "Couldn't copy the link", ok ? "info" : "error");
  });

  byId("exportBtn").addEventListener("click", () => {
    const blob = new Blob([library.exportJson()], { type: "application/json" });
    const link = h("a", {
      href: URL.createObjectURL(blob),
      download: `keyforge-saved-${new Date().toISOString().slice(0, 10)}.json`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Exported your saved names");
  });

  byId("importBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      const added = library.importJson(await file.text());
      toast(`Imported ${added} new item${added === 1 ? "" : "s"}`);
      onChange();
    } catch {
      toast("That file isn't a valid export", "error");
    }
  });

  byId("clearBtn").addEventListener("click", () => {
    const label = tab === "insights" ? "insights statistics" : tab;
    if (!confirm(`Clear all ${label}? This can't be undone.`)) return;
    if (tab === "favourites") library.clearFavourites();
    else if (tab === "history") library.clearHistory();
    else stats.reset();
    toast(`Cleared ${label}`);
    onChange();
  });

  return { render, isOpen };
}
