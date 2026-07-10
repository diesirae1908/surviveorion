import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      // community server (npm run server)
      "/api": "http://localhost:8787",
    },
  },
});
