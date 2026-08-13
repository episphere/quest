import { defineConfig } from 'vitest/config';
import { questDependencyResolver } from '../config/moduleResolution.js';

export default defineConfig({
  plugins: [questDependencyResolver],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'https://connect.test/' },
    },
    setupFiles: ['./tests/setup/jsdom.js'],
    include: ['./tests/knownDefects/**/*.spec.js'],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
