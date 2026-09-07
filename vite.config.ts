import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Static export only: no bot process, Worker, or server bindings.
export default defineConfig({
  // The standalone repository is published below /IFfanclub/. Using the same base in
  // development prevents a valid-looking page from silently loading
  // HTML fallbacks in place of images and video.
  base: (process.env.PAGES_BASE_PATH || '/IFfanclub').replace(/\/$/, '') + '/',
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: { outDir: 'dist/client', sourcemap: false },
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
});
