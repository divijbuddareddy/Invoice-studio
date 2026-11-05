/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base ('./') + hash routing means the build works on GitHub Pages under
// any repository name (https://<user>.github.io/<repo>/) and on a custom domain root.
// Override with VITE_BASE=/my-repo/ if you prefer an absolute base.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
