import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({ root: "preview", plugins: [react(), viteSingleFile()], build: { outDir: "../preview-dist", emptyOutDir: true } });
