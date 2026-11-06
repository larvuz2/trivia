import { defineConfig } from 'vite';

// Relative base so the built game works from any folder (USB stick, GitHub Pages, etc.)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
