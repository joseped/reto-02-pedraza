// QA del chat (R-24) contra el servidor real con el proveedor simulado.

import { expect, test, type Page } from "@playwright/test"
import { CLAVE_QA } from "../playwright.config.ts"

const PROMPT_PRD = "▶ Procesar buzón (PRD)"
const CONFIRMAR = "✔ Confirmar msg-006"

/** Abre el chat con la clave ya guardada y los datos reiniciados. */
async function abrirLimpio(page: Page): Promise<void> {
  await page.addInitScript((clave) => localStorage.setItem("clave", clave), CLAVE_QA)
  await page.request.post("/api/reset", { headers: { "x-access-key": CLAVE_QA } })
  await page.goto("/")
  await page.getByRole("button", { name: "Nueva sesión" }).click()
}

const ultimaRespuesta = (page: Page) => page.locator(".msg.agente:not(.pensando)").last()

test("health no expone claves e informa protección", async ({ request }) => {
  const r = await request.get("/api/health")
  const cuerpo = await r.json()
  expect(cuerpo).toMatchObject({ ok: true, provider: "simulado", llm_configurado: true, protegido: true })
  expect(JSON.stringify(cuerpo)).not.toMatch(/sk-ant|qa-clave/)
})

test("la API rechaza sin clave de acceso y el front la pide", async ({ page, request }) => {
  expect((await request.post("/api/chat", { data: { sessionId: "s-x", message: "hola" } })).status()).toBe(401)
  page.on("dialog", (d) => d.accept(CLAVE_QA))
  await page.goto("/")
  await page.getByPlaceholder(/Escribe un mensaje/).fill("hola")
  await page.getByRole("button", { name: "Enviar" }).click()
  await expect(ultimaRespuesta(page)).toContainText("modelo simulado")
})

test("flujo PRD: procesar buzón, banner de confirmación y registro tras confirmar", async ({ page }) => {
  await abrirLimpio(page)
  await page.getByRole("button", { name: PROMPT_PRD }).click()
  await expect(page.locator(".pensando")).toBeVisible()

  const r1 = ultimaRespuesta(page)
  await expect(r1.locator(".banner")).toContainText("espera tu confirmación", { timeout: 20_000 })
  await expect(r1).toHaveClass(/confirmar/)
  await expect(r1.locator("details.tool")).toHaveCount(13)
  await expect(r1.locator("details.tool .ko")).toHaveCount(0)
  await expect(r1.locator(".md table")).toBeVisible()
  await expect(r1).toContainText("msg-006")

  // La tarjeta de herramienta muestra argumentos y resultado (trazabilidad visible, CA4).
  const validar006 = r1.locator("details.tool", { hasText: "revisión: valor, fecha_inicio, fecha_fin, requiere_poliza" })
  await validar006.locator("summary").click()
  await expect(validar006.locator("pre")).toContainText('"mensaje_id": "msg-006"')
  await expect(validar006.locator("pre")).toContainText('"confianza": 0.5')

  await page.getByRole("button", { name: CONFIRMAR }).click()
  const r2 = ultimaRespuesta(page)
  await expect(r2).toContainText("Registré CM-2026-03", { timeout: 20_000 })
  await expect(r2.locator(".banner")).toHaveCount(0)
  await expect(r2.locator("details.tool", { hasText: "contratos_registrar" })).toContainText("nuevo CM-2026-03")
  await expect(r2.locator("details.tool", { hasText: "contratos_alertas" })).toHaveCount(1)
})

test("la sesión sobrevive a recargar la página", async ({ page }) => {
  await abrirLimpio(page)
  await page.getByRole("button", { name: PROMPT_PRD }).click()
  await expect(ultimaRespuesta(page).locator(".banner")).toBeVisible({ timeout: 20_000 })
  await page.reload()
  await expect(page.locator(".msg.usuario")).toHaveCount(1)
  await expect(ultimaRespuesta(page).locator("details.tool")).toHaveCount(13)
  await expect(ultimaRespuesta(page).locator(".banner")).toBeVisible()
})

test("reiniciar datos deja el buzón listo para repetir la demo", async ({ page }) => {
  await abrirLimpio(page)
  await page.getByRole("button", { name: PROMPT_PRD }).click()
  await expect(ultimaRespuesta(page).locator(".banner")).toBeVisible({ timeout: 20_000 })
  page.on("dialog", (d) => d.accept())
  await page.getByRole("button", { name: "Reiniciar datos" }).click()
  await expect(page.locator(".msg")).toHaveCount(0)
  await page.getByRole("button", { name: PROMPT_PRD }).click()
  await expect(ultimaRespuesta(page)).toContainText("Procesé 6 mensajes", { timeout: 20_000 })
})

test("el contenido del usuario y del agente se escapa (sin XSS)", async ({ page }) => {
  await abrirLimpio(page)
  const ataque = '<img src=x onerror="window.__xss=1"><b>negrita</b>'
  await page.getByPlaceholder(/Escribe un mensaje/).fill(ataque)
  await page.keyboard.press("Enter")
  await expect(ultimaRespuesta(page)).toContainText("modelo simulado")
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await expect(page.locator(".msg img")).toHaveCount(0)
  await expect(page.locator(".msg.usuario").last()).toHaveText(ataque)
})

test("si el servidor se está reiniciando, el mensaje lo explica", async ({ page }) => {
  await abrirLimpio(page)
  await page.route("**/api/chat", (r) => r.fulfill({ status: 503, contentType: "text/html", body: "<html>Service Unavailable</html>" }))
  await page.getByRole("button", { name: PROMPT_PRD }).click()
  await expect(ultimaRespuesta(page).locator(".error")).toContainText("se está iniciando")
  await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled()
})

test("móvil: el chat se usa sin desbordes horizontales", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirLimpio(page)
  await page.getByRole("button", { name: PROMPT_PRD }).click()
  await expect(ultimaRespuesta(page).locator(".banner")).toBeVisible({ timeout: 20_000 })
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde).toBeLessThanOrEqual(1)
  await expect(page.getByRole("button", { name: "Enviar" })).toBeInViewport()
})
