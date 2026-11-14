import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// @ts-expect-error process is a Node.js global in Vite config.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
