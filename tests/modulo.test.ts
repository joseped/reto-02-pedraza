// Bonus PRD §9.4: el módulo usa las MISMAS piezas que la aplicación (no copias divergentes)
// y funciona sin el servidor. Uso: npm test

import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, realpathSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import * as modulo from "../modulo/tools/contratos.ts"
import * as app from "../src/tools/contratos.ts"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const ruta = (p: string) => join(RAIZ, p)

/** Frontmatter YAML simple (claves de primer nivel y un nivel de anidación). */
function frontmatter(archivo: string): Record<string, string | Record<string, string>> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(archivo, "utf8"))
  assert.ok(m, `${archivo} no tiene frontmatter`)
  const datos: Record<string, string | Record<string, string>> = {}
  let padre: string | null = null
  for (const linea of (m[1] ?? "").split("\n")) {
    const hijo = /^\s+(\w+):\s*(.+)$/.exec(linea)
    const raiz = /^(\w+):\s*(.*)$/.exec(linea)
    if (hijo && padre) (datos[padre] as Record<string, string>)[hijo[1] ?? ""] = hijo[2] ?? ""
    else if (raiz) {
      padre = raiz[2] ? null : (raiz[1] ?? null)
      datos[raiz[1] ?? ""] = raiz[2] ? raiz[2] : {}
    }
  }
  return datos
}

test("agent.md es el mismo archivo que agent/prompt.md (system prompt de la app)", () => {
  assert.equal(realpathSync(ruta("modulo/agent.md")), realpathSync(ruta("agent/prompt.md")))
})

test("SKILL.md es el mismo archivo que el conocimiento de la app", () => {
  assert.equal(realpathSync(ruta("modulo/skill/registro-contratos/SKILL.md")), realpathSync(ruta("src/knowledge/registro-contratos.md")))
})

test("tools/contratos.ts exporta los mismos objetos que la app", () => {
  const nombres = Object.keys(app).sort()
  assert.deepEqual(Object.keys(modulo).sort(), nombres)
  for (const n of nombres) assert.equal(modulo[n as keyof typeof modulo], app[n as keyof typeof app], `${n} no es el mismo objeto`)
})

test("agent.md tiene el frontmatter exigido (description, mode: primary, permission edit/bash deny)", () => {
  const fm = frontmatter(ruta("modulo/agent.md"))
  assert.ok(typeof fm.description === "string" && fm.description.length > 20)
  assert.equal(fm.mode, "primary")
  assert.deepEqual(fm.permission, { edit: "deny", bash: "deny" })
})

test("SKILL.md tiene name (igual a su carpeta) y description", () => {
  const fm = frontmatter(ruta("modulo/skill/registro-contratos/SKILL.md"))
  assert.equal(fm.name, "registro-contratos")
  assert.ok(typeof fm.description === "string" && fm.description.length > 20)
})

test("cada herramienta cumple el contrato y se ejecuta sin el servidor", async () => {
  for (const [nombre, h] of Object.entries(modulo)) {
    assert.ok(typeof h.description === "string" && h.description.length > 10, `${nombre}: description`)
    assert.equal(typeof h.args, "object", `${nombre}: args`)
    assert.equal(typeof h.execute, "function", `${nombre}: execute`)
  }
  const dir = mkdtempSync(join(tmpdir(), "reto02-modulo-"))
  symlinkSync(ruta("fixtures"), join(dir, "fixtures"))
  const r = JSON.parse(await modulo.leer_buzon.execute({}, { directory: dir, sessionId: "modulo" })) as { ok: boolean; data: { mensajes: unknown[] } }
  assert.equal(r.ok, true)
  assert.equal(r.data.mensajes.length, 6)
})
