import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages (production) serves under /meddevkit/; Vercel previews serve from root
  base: process.env.VERCEL ? '/' : '/meddevkit/',
});
