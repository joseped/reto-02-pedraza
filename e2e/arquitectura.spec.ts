// QA del diagrama interactivo (docs/arquitectura.html servido en /arquitectura).

import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.goto("/arquitectura")
})

test("dibuja todos los nodos y aristas, sin errores de consola", async ({ page }) => {
  const errores: string[] = []
  page.on("pageerror", (e) => errores.push(e.message))
  await page.reload()
  await expect(page.locator("g.nodo")).toHaveCount(16)
  await expect(page.locator("g.arista")).toHaveCount(15)
  expect(errores).toEqual([])
})

test("clic en un nodo muestra archivo, requisitos y principios", async ({ page }) => {
  await page.locator("#n-guardia").click()
  const panel = page.locator("#panel")
  await expect(panel.locator("h2")).toHaveText("Guardia")
  await expect(panel).toContainText("turno ANTERIOR")
  await expect(panel.getByRole("link", { name: "src/agent/loop.ts" })).toHaveAttribute("href", /reto-02-pedraza\/blob\/main\/src\/agent\/loop\.ts$/)
  await expect(panel.locator(".chip", { hasText: "R-21" })).toBeVisible()
  await expect(page.locator("#n-guardia")).toHaveClass(/sel/)
})

test("recorrido ③: la guardia y la herramienta se marcan como bloqueadas", async ({ page }) => {
  await page.getByRole("button", { name: /Autoconfirmación bloqueada/ }).click()
  await expect(page.locator("#panel")).toContainText("Paso 1 de 3")
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("#panel")).toContainText("Paso 2 de 3")
  await expect(page.locator("#n-guardia")).toHaveClass(/bloq/)
  await page.getByRole("button", { name: "Siguiente →" }).click()
  await expect(page.locator("#n-tools")).toHaveClass(/bloq/)
  await expect(page.getByRole("button", { name: "Siguiente →" })).toBeDisabled()
  await expect(page.locator("#n-claude")).toHaveClass(/tenue/)
})

test("todos los recorridos llegan al final y la vista general limpia el resaltado", async ({ page }) => {
  for (const nombre of [/Procesar buzón/, /Confirmación humana/, /Autoconfirmación/, /demo\.ts/]) {
    await page.getByRole("button", { name: nombre }).click()
    const siguiente = page.getByRole("button", { name: "Siguiente →" })
    while (await siguiente.isEnabled()) await siguiente.click()
    await expect(page.locator("#panel .paso")).toBeVisible()
  }
  await page.getByRole("button", { name: "Vista general" }).click()
  await expect(page.locator(".tenue, .hi, .bloq")).toHaveCount(0)
})

test("los recorridos solo resaltan aristas que existen en el diagrama", async ({ page }) => {
  const faltan = await page.evaluate(() => {
    const ids = new Set([...document.querySelectorAll("[id]")].map((e) => e.id))
    const fuente = [...document.scripts].map((s) => s.textContent ?? "").join("\n")
    // Las claves de los recorridos tienen la forma "origen>destino" (con "!" si es un bloqueo).
    const claves = [...fuente.matchAll(/"!?([a-z]+>[a-z]+)"/g)].map((m) => m[1] ?? "")
    return claves.filter((c) => !ids.has(`e-${c}`))
  })
  expect(faltan).toEqual([])
})
