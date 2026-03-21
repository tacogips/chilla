import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: {
    name: "dom",
    environment: "jsdom",
    include: ["src/**/*.vitest.{ts,tsx}"],
  },
});
