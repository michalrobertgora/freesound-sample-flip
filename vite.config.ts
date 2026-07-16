import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  // Static hosting under a subpath (e.g. GitHub Pages) — adjust if needed.
  base: "./",
});
