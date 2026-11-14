import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages (/<repo>/) and Vercel (/) alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
} as never);
