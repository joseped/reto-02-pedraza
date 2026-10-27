// QA end-to-end con Playwright. Usa el Chrome instalado (sin descargar navegadores).
//   npm run e2e                → servidor con el proveedor "simulado": gratis, sin clave y determinista.
//   E2E_LIVE=1 npx playwright test → solo e2e/live.spec.ts contra el modelo real (requiere ANTHROPIC_API_KEY en .env).

import { defineConfig } from "@playwright/test"

export const CLAVE_QA = "qa-clave"
const PUERTO = 3210
const LIVE = process.env.E2E_LIVE === "1"

export default defineConfig({
  testDir: "e2e",
  ...(LIVE ? { testMatch: "live.spec.ts", timeout: 600_000 } : { testIgnore: "live.spec.ts" }),
  fullyParallel: false,
  workers: 1, // el servidor comparte out/: los escenarios corren en serie
  reporter: [["list"], ["html", { open: "never", outputFolder: "out/e2e-report" }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --env-file-if-exists=.env --import tsx src/server.ts",
    url: `http://localhost:${PUERTO}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(PUERTO), LLM_PROVIDER: LIVE ? "anthropic" : "simulado", FECHA_HOY: "2026-09-03", ACCESS_KEY: CLAVE_QA },
  },
})
