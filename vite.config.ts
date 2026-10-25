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
      if (!html || html.type !== "asset") return;
      let source = String(html.source);

      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === "chunk" && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, "<\\/script");
          source = source.replace(
            new RegExp(`<script[^>]*src="[^"]*${fileName}"[^>]*></script>`),
            () => `<script type="module">${code}</script>`,
          );
          delete bundle[fileName];
        } else if (file.type === "asset" && fileName.endsWith(".css")) {
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${fileName}"[^>]*>`),
            () => `<style>${String(file.source)}</style>`,
          );
          delete bundle[fileName];
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
  },
});
