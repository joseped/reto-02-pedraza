// API HTTP + front estático (PRD §6.4, R-23). Toda la lógica de negocio vive en tools/ y core/.

import { serve } from "@hono/node-server"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Hono, type Context } from "hono"
import { z } from "zod"
import { procesarMensaje, type Config } from "./agent/loop.ts"
import { borrarSesiones, idSesionValido, obtenerSesion } from "./agent/sessions.ts"
import { limpiarOut, type Ctx } from "./core/store.ts"
import type { LlmAdapter } from "./llm/adapter.ts"
import { AnthropicAdapter } from "./llm/anthropic.ts"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const env = (k: string, d: string) => process.env[k] ?? d

const cfg: Config = {
  maxIteraciones: Number(env("MAX_ITERACIONES", "25")),
  maxTokensSesion: Number(env("MAX_TOKENS_SESION", "400000")),
}
const MODELO = env("LLM_MODEL", "claude-opus-5-5")
const CLAVE_ACCESO = process.env.ACCESS_KEY

/** Comportamiento (agent/prompt.md) + conocimiento (src/knowledge/), sin el frontmatter. */
const sinFrontmatter = (t: string) => t.replace(/^---\n[\s\S]*?\n---\n/, "").trim()
const SYSTEM = [
  sinFrontmatter(readFileSync(join(RAIZ, "agent", "prompt.md"), "utf8")),
  "# Conocimiento",
  sinFrontmatter(readFileSync(join(RAIZ, "src", "knowledge", "registro-contratos.md"), "utf8")),
].join("\n\n")

let llm: LlmAdapter | null = null
const obtenerLlm = (): LlmAdapter | null => {
  if (!process.env.ANTHROPIC_API_KEY) return null
  llm ??= new AnthropicAdapter(MODELO, Number(env("LLM_TIMEOUT_MS", "90000")))
  return llm
}

const app = new Hono()

// Protección opcional del link público: si ACCESS_KEY está definida, /api/* (salvo health) la exige.
app.use("/api/*", async (c, next) => {
  if (!CLAVE_ACCESO || c.req.path === "/api/health") return next()
  if (c.req.header("x-access-key") !== CLAVE_ACCESO) return c.json({ ok: false, error: "clave de acceso inválida" }, 401)
  return next()
})

app.get("/api/health", (c) => c.json({ ok: true, provider: "anthropic", model: MODELO, llm_configurado: Boolean(process.env.ANTHROPIC_API_KEY), protegido: Boolean(CLAVE_ACCESO) }))

const CuerpoChat = z.object({ sessionId: z.string().refine(idSesionValido, "sessionId inválido"), message: z.string().min(1).max(4000) })

/** Un turno por sesión a la vez: evita condiciones de carrera sobre el historial. */
const ocupadas = new Set<string>()

app.post("/api/chat", async (c) => {
  const cuerpo = CuerpoChat.safeParse(await c.req.json().catch(() => null))
  if (!cuerpo.success) return c.json({ ok: false, error: cuerpo.error.issues.map((i) => i.message).join("; ") }, 400)
  const { sessionId, message } = cuerpo.data
  const modelo = obtenerLlm()
  if (!modelo) return c.json({ reply: "", toolCalls: [], needsConfirmation: false, error: "El servidor no tiene configurada la clave del modelo (ANTHROPIC_API_KEY). Puedes ejecutar `npm run demo` para ver las herramientas sin modelo." })
  if (ocupadas.has(sessionId)) return c.json({ ok: false, error: "esta sesión ya está procesando un mensaje" }, 409)

  ocupadas.add(sessionId)
  try {
    const ctx: Ctx = { directory: RAIZ, sessionId }
    return c.json(await procesarMensaje(obtenerSesion(RAIZ, sessionId), message, modelo, SYSTEM, ctx, cfg))
  } catch (e) {
    console.error("error no controlado en /api/chat:", e instanceof Error ? e.message : e)
    return c.json({ reply: "", toolCalls: [], needsConfirmation: false, error: "Ocurrió un error interno. La sesión sigue disponible; intenta de nuevo." })
  } finally {
    ocupadas.delete(sessionId)
  }
})

app.get("/api/sessions/:id", (c) => {
  const id = c.req.param("id")
  if (!idSesionValido(id)) return c.json({ ok: false, error: "id inválido" }, 400)
  const s = obtenerSesion(RAIZ, id)
  return c.json({ id: s.id, turno: s.turno, tokens: s.tokens, pendientes: Object.keys(s.pendientes), chat: s.chat })
})

/** Reinicia out/ (maestro, historial, procesados, sesiones) para repetir la demo desde cero. */
app.post("/api/reset", (c) => {
  limpiarOut({ directory: RAIZ, sessionId: "reset" })
  borrarSesiones()
  return c.json({ ok: true })
})

// no-store: tras cada despliegue el navegador recibe el front actualizado.
const pagina = (archivo: string) => (c: Context) => {
  c.header("cache-control", "no-store")
  return c.html(readFileSync(join(RAIZ, archivo), "utf8"))
}
app.get("/", pagina("web/index.html"))
app.get("/arquitectura", pagina("docs/arquitectura.html"))

const puerto = Number(env("PORT", "3000"))
serve({ fetch: app.fetch, port: puerto }, () => console.log(`Agente de contratos en http://localhost:${puerto} · modelo ${MODELO}`))
