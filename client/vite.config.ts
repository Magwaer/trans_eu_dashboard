import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root,
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  css: {
    postcss: path.resolve(root, "../postcss.config.js"),
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
});
