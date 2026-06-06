import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700
  },
  server: {
    port: 5173
  }
});
