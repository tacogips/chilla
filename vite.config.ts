import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// @ts-expect-error process is a Node.js global in Vite config.
const host = process.env.TAURI_DEV_HOST;

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "node_modules/pdfjs-dist",
);
const resourceDirs = ["cmaps", "standard_fonts", "wasm"] as const;

function pdfjsResources(): Plugin {
  let outDir = "dist";
  let building = false;
  return {
    name: "pdfjsResources",
    configResolved(config) {
      outDir = config.build.outDir;
      building = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? "").split("?")[0] ?? "";
        const dir = resourceDirs.find((name) =>
          pathname.startsWith(`/pdfjs/${name}/`),
        );
        if (!dir) {
          next();
          return;
        }
        const root = resolve(packageRoot, dir);
        let file: string;
        try {
          file = resolve(
            root,
            decodeURIComponent(pathname.slice(`/pdfjs/${dir}/`.length)),
          );
        } catch {
          response.statusCode = 400;
          response.end();
          return;
        }
        if (
          !file.startsWith(root + sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          response.statusCode = 404;
          response.end();
          return;
        }
        const extension = extname(file);
        if ([".bcmap", ".pfb", ".ttf"].includes(extension))
          response.setHeader("Content-Type", "application/octet-stream");
        else if ([".js", ".mjs"].includes(extension))
          response.setHeader("Content-Type", "text/javascript");
        else if (extension === ".wasm")
          response.setHeader("Content-Type", "application/wasm");
        createReadStream(file).pipe(response);
      });
    },
    closeBundle() {
      if (!building) return;
      for (const dir of resourceDirs)
        cpSync(resolve(packageRoot, dir), resolve(outDir, "pdfjs", dir), {
          recursive: true,
        });
    },
  };
}

export default defineConfig(() => ({
  plugins: [solid(), pdfjsResources()],
  worker: { format: "es" },
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
