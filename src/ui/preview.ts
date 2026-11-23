import { forService } from "../core/availability.ts";
import type { Generator } from "../core/types.ts";
import { byId, h } from "./dom.ts";
import { icon } from "./icons.ts";
import { displayName, downloadPng, downloadSvg, logoSvg } from "./logo.ts";
import { canSpeak, speak } from "./speak.ts";

/**
 * "See it before you pick it": shows a name the way it would actually be used.
 * Mock-ups are deliberately generic (no real platform's logo or branding).
 */
type View = "profile" | "app" | "website" | "badge" | "id" | "logo";

const VIEWS_FOR: Record<string, View[]> = {
  username: ["profile", "website", "logo"],
  "project-name": ["app", "website", "logo"],
  "team-name": ["badge", "logo"],
  "person-name": ["id", "profile", "logo"],
  persona: ["id", "profile"],
};
const LABELS: Record<View, string> = {
  profile: "Social profile", app: "App icon", website: "Website", badge: "Team badge", id: "ID card", logo: "Logo",
};

export const hasPreview = (generatorId: string) => generatorId in VIEWS_FOR;

/** Persona values look like "Thea Ashford · @hellothea · thea.ashford@example.com". */
function parts(gen: Generator, value: string) {
  if (gen.id === "persona") {
    const [name = value, handle = "", email = ""] = value.split(" · ");
    return { name, handle: handle.replace(/^@/, ""), email };
  }
  const handle = forService(value).github.replace(/[^a-z0-9._-]/g, "");
  return { name: gen.id === "username" ? displayName(value) : value, handle, email: "" };
}

function avatar(name: string, variant: number, size: string) {
  const svg = logoSvg(name, variant);
  svg.setAttribute("class", "mock-avatar");
  svg.style.width = svg.style.height = size;
  return svg;
}

function profileMock(gen: Generator, value: string, variant: number) {
  const p = parts(gen, value);
  return h("div", { class: "mock mock-profile" },
    h("div", { class: "mock-cover" }),
    h("div", { class: "mock-profile-body" },
      avatar(p.name, variant, "84px"),
      h("div", { class: "mock-profile-text" },
        h("strong", { class: "mock-display" }, p.name),
        h("span", { class: "mock-handle" }, `@${p.handle || value}`),
        h("p", { class: "mock-bio" }, "Building things on the internet · DMs open"),
        h("div", { class: "mock-stats" }, h("span", {}, h("b", {}, "1,204"), " followers"), h("span", {}, h("b", {}, "318"), " following")),
      ),
      h("span", { class: "mock-follow" }, "Follow"),
    ),
  );
}

function appMock(value: string, variant: number) {
  const icon = avatar(value, variant, "100%");
  const label = value.length > 12 ? `${value.slice(0, 11)}…` : value;
  const filler = Array.from({ length: 11 }, (_, i) => h("span", { class: `mock-app filler f${i % 4}` }));
  filler.splice(5, 0, h("span", { class: "mock-app mine" }, icon, h("small", {}, label)));
  return h("div", { class: "mock mock-phone" },
    h("div", { class: "mock-phone-screen" },
      h("div", { class: "mock-statusbar" }, h("span", {}, "9:41"), h("span", {}, "●●● ▲ ▮")),
      h("div", { class: "mock-grid" }, ...filler),
    ),
  );
}

function websiteMock(gen: Generator, value: string, variant: number) {
  const domain = `${forService(value).domain || "yourname"}.com`;
  const p = parts(gen, value);
  return h("div", { class: "mock mock-browser" },
    h("div", { class: "mock-browser-bar" },
      h("span", { class: "mock-dots" }, h("i", {}), h("i", {}), h("i", {})),
      h("span", { class: "mock-url" }, icon("lock"), domain),
    ),
    h("div", { class: "mock-site" },
      h("div", { class: "mock-site-nav" }, avatar(p.name, variant, "28px"), h("strong", {}, p.name), h("span", {}, "About · Work · Contact")),
      h("h3", { class: "mock-site-hero" }, gen.id === "username" ? `Hi, I'm ${p.name}.` : `${p.name}: the simplest way to get it done.`),
      h("p", { class: "mock-site-sub" }, gen.id === "username" ? "Links, projects and everything I make." : "Fast, private and built for people like you."),
      h("span", { class: "mock-cta" }, gen.id === "username" ? "See my links" : "Get started"),
    ),
  );
}

function badgeMock(value: string, variant: number) {
  return h("div", { class: "mock mock-badge" },
    h("div", { class: "mock-shield" }, avatar(value, variant, "96px"), h("strong", {}, value.toUpperCase())),
    h("div", { class: "mock-jersey" }, h("span", { class: "mock-jersey-name" }, value.split(" ").at(-1)?.toUpperCase() ?? value), h("span", { class: "mock-jersey-no" }, "07")),
  );
}

function idMock(gen: Generator, value: string, variant: number) {
  const p = parts(gen, value);
  return h("div", { class: "mock mock-id" },
    h("div", { class: "mock-id-band" }, h("span", {}, "MEMBER CARD"), h("span", {}, "SAMPLE")),
    h("div", { class: "mock-id-body" },
      avatar(p.name, variant, "88px"),
      h("div", {},
        h("strong", { class: "mock-display" }, p.name),
        p.handle ? h("span", { class: "mock-handle" }, `@${p.handle}`) : "",
        p.email ? h("span", { class: "mock-email" }, p.email) : "",
        h("span", { class: "mock-since" }, "Member since 2026"),
      ),
    ),
  );
}

function logoMock(value: string, variant: number) {
  const big = logoSvg(value, variant);
  big.setAttribute("class", "mock-logo-big");
  return h("div", { class: "mock mock-logo" },
    big,
    h("div", { class: "mock-logo-row" },
      ...[0, 1, 2, 3].map(i => {
        const small = logoSvg(value, variant + i + 1);
        small.setAttribute("class", "mock-logo-small");
        return small;
      }),
    ),
  );
}

/** A single mock-up on its own, e.g. for the home page's live "how it works" pictures. */
export function mockFor(gen: Generator, value: string, view: "profile" | "app" | "website", variant = 0): HTMLElement {
  return view === "profile" ? profileMock(gen, value, variant) : view === "app" ? appMock(value, variant) : websiteMock(gen, value, variant);
}

export function setupPreview() {
  const dialog = byId<HTMLDialogElement>("previewDialog");
  const title = byId("previewTitle");
  const tabs = byId("previewTabs");
  const stage = byId("previewStage");
  const speakBtn = byId<HTMLButtonElement>("previewSpeak");
  let current: { gen: Generator; value: string; view: View; variant: number } | null = null;

  byId("previewClose").append(icon("x"));
  byId("previewClose").addEventListener("click", () => dialog.close());
  speakBtn.prepend(icon("volume"));
  speakBtn.hidden = !canSpeak();
  speakBtn.addEventListener("click", () => current && speak(current.value));
  byId("previewStyle").prepend(icon("shuffle"));
  byId("previewStyle").addEventListener("click", () => {
    if (!current) return;
    current.variant++;
    render();
  });
  byId("previewPng").prepend(icon("download"));
  byId("previewPng").addEventListener("click", () => current && void downloadPng(parts(current.gen, current.value).name, current.variant));
  byId("previewSvg").addEventListener("click", () => current && downloadSvg(parts(current.gen, current.value).name, current.variant));
  // Clicking the dark backdrop (outside the panel) closes it, like most apps.
  dialog.addEventListener("click", e => {
    if (e.target === dialog) dialog.close();
  });

  function render(): void {
    if (!current) return;
    const { gen, value, view, variant } = current;
    title.textContent = value;
    tabs.replaceChildren(...VIEWS_FOR[gen.id].map(v => {
      const tab = h("button", { type: "button", class: "chip", "aria-pressed": String(v === view) }, LABELS[v]);
      tab.addEventListener("click", () => {
        if (current) current.view = v;
        render();
      });
      return tab;
    }));
    const mock = view === "profile" ? profileMock(gen, value, variant)
      : view === "app" ? appMock(value, variant)
        : view === "website" ? websiteMock(gen, value, variant)
          : view === "badge" ? badgeMock(value, variant)
            : view === "id" ? idMock(gen, value, variant)
              : logoMock(value, variant);
    stage.replaceChildren(mock, h("p", { class: "mock-note" }, "A mock-up to help you imagine the name in use. Not a real account or site."));
  }

  return {
    open(gen: Generator, value: string): void {
      if (!hasPreview(gen.id)) return;
      current = { gen, value, view: VIEWS_FOR[gen.id][0], variant: 0 };
      render();
      if (!dialog.open) dialog.showModal();
    },
  };
}
