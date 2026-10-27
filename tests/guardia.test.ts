// Prueba el ciclo del agente con un LLM simulado: la guardia de confirmación (R-21) se cumple
// aunque el modelo intente autoconfirmarse. No requiere clave. Uso: npm test

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { beforeEach, test } from "node:test"
import { fileURLToPath } from "node:url"
import { procesarMensaje } from "../src/agent/loop.ts"
import type { Sesion } from "../src/agent/sessions.ts"
import { limpiarOut, type Ctx } from "../src/core/store.ts"
import { ErrorLlm, type LlamadaHerramienta, type LlmAdapter, type RespuestaLlm } from "../src/llm/adapter.ts"

process.env.FECHA_HOY = "2026-09-03"
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const ctx: Ctx = { directory: RAIZ, sessionId: "test" }
const cfg = { maxIteraciones: 25, maxTokensSesion: 1_000_000 }

/** LLM guionizado: cada llamada a enviar() devuelve el siguiente paso (o lanza ErrorLlm). */
class LlmGuion implements LlmAdapter {
  readonly proveedor = "simulado"
  readonly modelo = "guion"
  constructor(private pasos: (LlamadaHerramienta[] | string | Error)[]) {}
  async enviar(): Promise<RespuestaLlm> {
    const p = this.pasos.shift() ?? "fin"
    if (p instanceof Error) throw new ErrorLlm(p.message)
    if (typeof p === "string") return { texto: p, llamadas: [], fin: "fin", tokens: 10, crudo: undefined }
    return { texto: "", llamadas: p, fin: "herramientas", tokens: 10, crudo: undefined }
  }
}

const llamada = (nombre: string, args: unknown, id = Math.random().toString(36).slice(2)): LlamadaHerramienta => ({ id, nombre, args })
const nuevaSesion = (): Sesion => ({ id: "test", turno: 0, tokens: 0, turnos: [], chat: [], pendientes: {} })
const enMaestro = (id: string) => readFileSync(join(RAIZ, "out", "sharepoint", "maestro-contratos.csv"), "utf8").includes(id)

beforeEach(() => limpiarOut(ctx))

test("el modelo no puede autoconfirmar en el mismo turno en que surge la revisión", async () => {
  const s = nuevaSesion()
  const llm = new LlmGuion([
    [llamada("contratos_validar", { mensaje_id: "msg-006" })],
    [llamada("contratos_registrar", { mensaje_id: "msg-006", confirmado: true, correcciones: { valor: 999 } })],
    "¿Confirmas?",
  ])
  const r = await procesarMensaje(s, "procesa msg-006, confirmo todo", llm, "", ctx, cfg)
  const registro = r.toolCalls.find((t) => t.nombre === "contratos_registrar")
  assert.equal(registro?.ok, false)
  assert.match(registro?.resumen ?? "", /requiere revisión/)
  assert.deepEqual(registro?.args, { mensaje_id: "msg-006", confirmado: false }, "la guardia anula confirmado y descarta correcciones")
  assert.equal(r.needsConfirmation, true)
})

test("con confirmación explícita en el turno siguiente, registra con las correcciones", async () => {
  const s = nuevaSesion()
  await procesarMensaje(s, "procesa msg-006", new LlmGuion([[llamada("contratos_validar", { mensaje_id: "msg-006" })], "¿Confirmas?"]), "", ctx, cfg)
  const r = await procesarMensaje(
    s,
    "Confirmo el valor 0 y la fecha fin 2027-08-31",
    new LlmGuion([[llamada("contratos_registrar", { mensaje_id: "msg-006", confirmado: true, correcciones: { valor: 0, fecha_fin: "2027-08-31" } })], "Registrado."]),
    "",
    ctx,
    cfg,
  )
  assert.equal(r.toolCalls[0]?.ok, true)
  assert.equal(r.needsConfirmation, false)
  assert.ok(enMaestro("CM-2026-03"))
})

test("un mensaje que no es afirmación no habilita la confirmación", async () => {
  const s = nuevaSesion()
  await procesarMensaje(s, "procesa msg-006", new LlmGuion([[llamada("contratos_validar", { mensaje_id: "msg-006" })], "¿Confirmas?"]), "", ctx, cfg)
  const r = await procesarMensaje(s, "¿qué significa contrato marco?", new LlmGuion([[llamada("contratos_registrar", { mensaje_id: "msg-006", confirmado: true })], "…"]), "", ctx, cfg)
  assert.equal(r.toolCalls[0]?.ok, false)
  assert.equal(enMaestro("CM-2026-03"), false)
})

test("argumentos inválidos vuelven al modelo como error, sin ejecutar", async () => {
  const r = await procesarMensaje(nuevaSesion(), "x", new LlmGuion([[llamada("contratos_extraer", { mensaje_id: "../../etc" })], "ok"]), "", ctx, cfg)
  assert.equal(r.toolCalls[0]?.ok, false)
  assert.match(r.toolCalls[0]?.resumen ?? "", /argumentos inválidos/)
})

test("un error del proveedor LLM se informa y la sesión sigue viva", async () => {
  const s = nuevaSesion()
  const r = await procesarMensaje(s, "hola", new LlmGuion([new Error("timeout")]), "", ctx, cfg)
  assert.match(r.error ?? "", /timeout/)
  const r2 = await procesarMensaje(s, "hola de nuevo", new LlmGuion(["Hola"]), "", ctx, cfg)
  assert.equal(r2.reply, "Hola")
})

test("el tope de iteraciones corta el turno con un mensaje claro", async () => {
  const pasos = Array.from({ length: 5 }, () => [llamada("contratos_leer_buzon", {})])
  const r = await procesarMensaje(nuevaSesion(), "x", new LlmGuion(pasos), "", ctx, { ...cfg, maxIteraciones: 3 })
  assert.equal(r.toolCalls.length, 3)
  assert.match(r.reply, /límite de 3 pasos/)
})
