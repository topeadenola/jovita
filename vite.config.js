import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Two apps: the studio app (/) and Jovita HQ, the super admin (/admin/)
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), admin: resolve(__dirname, "admin/index.html") } } },
});
