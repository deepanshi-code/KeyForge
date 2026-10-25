import type { Library } from "../core/library.ts";
import { findGenerator } from "../core/registry.ts";
import type { Stats } from "../core/stats.ts";
import { byId, copyText, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { toast } from "./toast.ts";

type Tab = "favourites" | "history" | "insights";

/** Results needed in each mode before the comparison means much. */
const MIN_SAMPLE = 30;

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/** The "Saved" slide-out drawer: favourites, history and insights tabs, plus export/import/clear. */
export function setupLibraryDrawer(library: Library, stats: Stats, onChange: () => void) {
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

  /** Compares star rates with and without taste learning — evidence, not a claim. */
  function renderInsights(): void {
    const s = stats.summary();
    const card = (label: string, c: typeof s.taste) =>
      h("div", { class: "stat-card" },
        h("span", { class: "stat-label" }, label),
        h("span", { class: "stat-value" }, percent(c.rate)),
        h("span", { class: "muted small" }, `${c.starred} starred of ${c.shown} shown`),
      );

    const taste = s.taste.rate ?? 0;
    const random = s.random.rate ?? 0;
    let verdict: string;
    if (s.taste.shown < MIN_SAMPLE || s.random.shown < MIN_SAMPLE) {
      verdict = `Keep going: with fewer than ${MIN_SAMPLE} results in each mode, any difference could easily be chance. ` +
        "Turn “Learn my taste” off now and then so both modes get measured.";
    } else if (taste > random * 1.2) {
      verdict = random > 0
        ? `Taste learning is working: you star ${(taste / random).toFixed(1)}× as often when results are ranked by your taste.`
        : "Taste learning is working: you've starred taste-ranked results, but none of the random ones.";
    } else if (taste < random * 0.8) {
      verdict = "Random results are getting more stars right now, so taste learning isn't helping yet.";
    } else {
      verdict = "No clear difference: you star taste-ranked and random results at a similar rate.";
    }

    list.replaceChildren(h("li", { class: "insights" },
      h("p", { class: "muted small" },
        "How often you star a result, counted once you have 3+ favourites (so both modes are compared fairly). " +
        "If taste learning works, the first number should be higher."),
      h("div", { class: "stat-grid" }, card("With taste learning", s.taste), card("Without", s.random)),
      h("p", { class: "verdict" }, verdict),
    ));
  }

  function render(): void {
    const favourites = library.favourites();
    badge.textContent = String(favourites.length);
    badge.hidden = favourites.length === 0;
    tabs.forEach(t => t.setAttribute("aria-pressed", String(t.dataset.tab === tab)));
    byId("exportBtn").hidden = tab === "insights";
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
        library.toggleFavourite(item.generatorId, item.value);
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

  tabs.forEach(t => t.addEventListener("click", () => {
    tab = (t.dataset.tab as Tab | undefined) ?? "favourites";
    render();
  }));

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
