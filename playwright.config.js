import { defineConfig, devices } from '@playwright/test';

const testServerPort = Number.parseInt(process.env.QUEST_PLAYWRIGHT_PORT ?? '4173', 10);
const testServerOrigin = `http://127.0.0.1:${testServerPort}`;

const desktopProjects = [
  { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
];

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/playwright-junit.xml' }], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: testServerOrigin,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    ...desktopProjects,
    {
      name: 'chromium-phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'chromium-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
      },
    },
    {
      name: 'chromium-windows-ua',
      use: {
        ...devices['Desktop Chrome'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      },
    },
  ],
  webServer: {
    command: `npx vite --config vite.config.js --port ${testServerPort}`,
    url: `${testServerOrigin}/tests/harness/participant.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
