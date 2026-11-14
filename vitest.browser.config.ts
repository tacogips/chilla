import { defineConfig } from "vitest/config";
import { preview } from "@vitest/browser-preview";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: {
    name: "browser",
    include: ["tests/browser/**/*.browser.tsx"],
    browser: {
      enabled: true,
      provider: preview(),
      instances: [{ browser: "chromium" }],
    },
  },
});
