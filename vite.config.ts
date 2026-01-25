import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    fs: {
      allow: [".."],
    },
    hmr: {
      protocol: "wss",
      host: "dev-volve-explorer.ocortez.com",
      clientPort: 443,
    },
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
});
