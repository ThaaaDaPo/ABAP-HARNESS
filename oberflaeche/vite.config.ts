import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Kein eigener Ordner für Vite-Zwischendaten im Projekt
  cacheDir: "../daten/vite-cache",
});
