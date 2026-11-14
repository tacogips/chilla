import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        privacy: resolve(import.meta.dirname, "privacy/index.html"),
        japanese: resolve(import.meta.dirname, "ja/index.html"),
        japanesePrivacy: resolve(import.meta.dirname, "ja/privacy/index.html"),
      },
    },
  },
});
