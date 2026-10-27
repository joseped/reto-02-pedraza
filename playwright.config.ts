// QA end-to-end con Playwright. Usa el Chrome instalado (sin descargar navegadores) y
// levanta el servidor con el proveedor "simulado": gratis, sin clave y determinista.
// Uso: npm run e2e

import { defineConfig } from "@playwright/test"

export const CLAVE_QA = "qa-clave"
const PUERTO = 3210

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // el servidor comparte out/: los escenarios corren en serie
  reporter: [["list"], ["html", { open: "never", outputFolder: "out/e2e-report" }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx src/server.ts",
    url: `http://localhost:${PUERTO}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(PUERTO), LLM_PROVIDER: "simulado", FECHA_HOY: "2026-09-03", ACCESS_KEY: CLAVE_QA },
  },
})
