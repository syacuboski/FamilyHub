import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a throwaway PocketBase (:8091) and the Vite dev
// server (:5174) proxying to it. Nothing touches your dev data in .pb/pb_data.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/e2e-pb.mjs',
      url: 'http://127.0.0.1:8092',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      env: { PB_URL: 'http://127.0.0.1:8091' },
      timeout: 60_000,
    },
  ],
});
