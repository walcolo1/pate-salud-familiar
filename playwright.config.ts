import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de A6-F2 — Paté · Salud Familiar
 *
 * SEGURIDAD DE LAS PRUEBAS
 *  · Servidor SIEMPRE local (puerto 3100). Nunca Vercel ni producción.
 *  · Backend `sheets`: no se toca ningún proyecto de Firebase.
 *  · Credenciales de Firebase deliberadamente falsas.
 *  · La sesión se obtiene por el MODO DEMOSTRACIÓN de la app, no por OAuth.
 *  · Cada prueba corre en un contexto de navegador aislado (Playwright lo hace
 *    por defecto), así que localStorage e IndexedDB parten siempre de cero.
 *  · Sin storageState, sin cookies persistidas, sin credenciales en el repo.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    // Compilacion de produccion: sin HMR, comportamiento identico al real.
    command: 'npm run build && npx next start --port 3100',
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_DATA_BACKEND: 'sheets',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-falsa',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'e2e.invalid',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-e2e-a6',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'e2e.invalid',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:0:web:e2e',
    },
  },
});
