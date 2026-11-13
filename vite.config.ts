import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // In development, forward AI calls to the API server (npm run server).
    proxy: { "/api": "http://localhost:8787" },
  },
});
