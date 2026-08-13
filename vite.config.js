import { defineConfig } from 'vite';
import { questDependencyResolver } from './tests/config/moduleResolution.js';

export default defineConfig({
  plugins: [questDependencyResolver],
  optimizeDeps: {
    include: ['mathjs'],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
