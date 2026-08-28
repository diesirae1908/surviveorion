import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        guide: "guide.html",
      },
    },
  },
  server: {
    proxy: {
      // community server (npm run server)
      "/api": "http://localhost:8787",
    },
  },
});
