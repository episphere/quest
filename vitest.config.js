import { defineConfig } from 'vitest/config';
import { questDependencyResolver } from './tests/config/moduleResolution.js';

export default defineConfig({
  plugins: [questDependencyResolver],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // Use a synthetic non-local origin to model Quest embedded in Connect.
        url: 'https://connect.test/',
      },
    },
    setupFiles: ['./tests/setup/jsdom.js'],
    include: ['./tests/{unit,integration,corpus}/**/*.spec.js'],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        '*.js',
        'i18n/*.js'
      ],
      exclude: [
        'quest.js',
        '*.config.js'
      ],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 75,
        lines: 75
      }
    }
  }
});
