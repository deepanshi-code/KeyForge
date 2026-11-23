/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";

/**
 * Inlines the built JS and CSS into dist/index.html, so the build is a single
 * file that also works when opened by double-click (file://). Browsers block
 * separate module script files on file://, but allow inline ones.
 */
function inlineIntoHtml(): Plugin {
  return {
    name: "inline-into-html",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (html?.type !== "asset") return;
      let source = String(html.source);
      const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      /**
       * Swaps one tag for its inlined content. If the tag isn't found (say Vite
       * changes how it writes it), stop the build: deleting the file anyway would
       * ship a page that points at nothing — a blank site.
       */
      const inline = (fileName: string, tag: RegExp, replacement: () => string) => {
        const before = source;
        source = source.replace(tag, replacement); // a function: "$&" in the code stays literal
        if (source === before) this.error(`inline-into-html: no tag for ${fileName} found in index.html`);
        delete bundle[fileName];
      };

      for (const [fileName, file] of Object.entries(bundle)) {
        const name = escapeRegExp(fileName);
        if (file.type === "chunk" && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, "<\\/script");
          inline(fileName, new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
        } else if (file.type === "asset" && fileName.endsWith(".css")) {
          // url(./font.woff2) inside assets/x.css means assets/font.woff2. Once the CSS moves into
          // index.html (one folder up), those paths must say so, or fonts quietly fail to load.
          const dir = fileName.includes("/") ? fileName.slice(0, fileName.lastIndexOf("/") + 1) : "";
          const css = String(file.source).replace(/url\((['"]?)\.\//g, (_m, quote: string) => `url(${quote}./${dir}`);
          inline(fileName, new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`), () => `<style>${css}</style>`);
        }
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  // Relative paths so the build works on GitHub Pages sub-paths as well as Netlify/Vercel.
  base: "./",
  plugins: [inlineIntoHtml()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20_000, // model-training tests take a few seconds, more under mutation testing
  },
});
