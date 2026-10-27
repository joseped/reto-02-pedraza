// Evidencia con el modelo REAL: flujo del PRD §11 en el navegador, con capturas y transcripción.
// Solo corre con E2E_LIVE=1 (ver playwright.config.ts). Consume tokens de la clave en .env.

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { CLAVE_QA } from "../playwright.config.ts"
import { fotoElemento } from "./evidencia.ts"

const DIR = "docs/evidencia/modelo-real"
const SESION = "s-evidencia"

type Llamada = { nombre: string; args: unknown; ok: boolean; resumen: string }
type Entrada = { rol: "usuario" | "agente"; texto: string; toolCalls?: Llamada[]; needsConfirmation?: boolean; error?: string }

test("modelo real: flujo PRD §11 de punta a punta", async ({ page, request }) => {
  mkdirSync(DIR, { recursive: true })
  const cabeceras = { "x-access-key": CLAVE_QA }
  await request.post("/api/reset", { headers: cabeceras })
  await page.addInitScript(({ clave, sesion }) => { localStorage.setItem("clave", clave); localStorage.setItem("sesion", sesion) }, { clave: CLAVE_QA, sesion: SESION })
  await page.goto("/")
  await expect(page.locator("#meta")).toContainText("anthropic")

  await page.getByRole("button", { name: "▶ Procesar buzón (PRD)" }).click()
  const r1 = page.locator(".msg.agente:not(.pensando)").last()
  await expect(r1.locator(".banner")).toBeVisible({ timeout: 240_000 })
  await expect(r1.locator("details.tool .ko")).toHaveCount(0)
  await fotoElemento(r1, `${DIR}/01-turno1-procesar-buzon.png`)

  await page.getByRole("button", { name: "✔ Confirmar msg-006" }).click()
  const r2 = page.locator(".msg.agente:not(.pensando)").nth(1)
  await expect(r2.locator("details.tool", { hasText: "contratos_registrar" })).toContainText("nuevo CM-2026-03", { timeout: 240_000 })
  await expect(r2.locator(".banner")).toHaveCount(0)
  await fotoElemento(r2, `${DIR}/02-turno2-confirmacion.png`)

  const sesion = (await (await request.get(`/api/sessions/${SESION}`, { headers: cabeceras })).json()) as { tokens: number; chat: Entrada[] }
  writeFileSync(`${DIR}/sesion.json`, JSON.stringify(sesion, null, 2))
  writeFileSync(`${DIR}/transcripcion.md`, transcripcion(sesion.chat, sesion.tokens))
  for (const f of ["sharepoint/maestro-contratos.csv", "sharepoint/historial.jsonl", "alertas.md", "log.jsonl"]) copyFileSync(`out/${f}`, `${DIR}/${f.split("/").pop()}`)
})

function transcripcion(chat: Entrada[], tokens: number): string {
  const partes = [`# Transcripción · modelo real\n\nGenerada por \`e2e/live.spec.ts\` · tokens de la sesión: ${tokens}\n`]
  for (const e of chat) {
    if (e.rol === "usuario") { partes.push(`## 🧑 Analista\n\n> ${e.texto}\n`); continue }
    partes.push(`## 🤖 Agente${e.needsConfirmation ? " · ⏸ espera confirmación" : ""}\n`)
    if (e.toolCalls?.length) {
      partes.push("| # | Herramienta | Argumentos | Resultado |\n|---|---|---|---|")
      e.toolCalls.forEach((t, i) => partes.push(`| ${i + 1} | ${t.ok ? "✓" : "✗"} \`${t.nombre}\` | \`${JSON.stringify(t.args)}\` | ${t.resumen} |`))
      partes.push("")
    }
    partes.push(e.texto, e.error ? `\n**Error:** ${e.error}` : "", "")
  }
  return partes.join("\n")
}
