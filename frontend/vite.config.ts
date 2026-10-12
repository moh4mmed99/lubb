import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from phones on the same Wi-Fi (simulator)
    proxy: {
      "/api": { target: "http://localhost:8000", ws: true },
      "/ws": { target: "http://localhost:8000", ws: true },
    },
  },
});
