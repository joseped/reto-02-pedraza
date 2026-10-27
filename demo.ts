// Verificación sin modelo (PRD §6.6): procesa el buzón llamando directamente a las herramientas
// y comprueba los criterios de aceptación de specs/spec.md §3. Uso: npm run demo

import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { limpiarOut, type Ctx } from "./src/core/store.ts"
import * as contratos from "./src/tools/contratos.ts"

process.env.FECHA_HOY ??= "2026-09-03"
const HOY = process.env.FECHA_HOY
const ctx: Ctx = { directory: dirname(fileURLToPath(import.meta.url)), sessionId: "demo" }

type Resp = { ok: boolean; data?: Record<string, unknown>; error?: string }
const llamar = async (p: Promise<string>) => JSON.parse(await p) as Resp

let fallos = 0
function verificar(descripcion: string, condicion: boolean): void {
  if (!condicion) fallos++
  console.log(`   ${condicion ? "✓" : "✗"} ${descripcion}`)
}

const ESPERADO: Record<string, { clasificacion: string; revision: string[]; registra: boolean }> = {
  "msg-001": { clasificacion: "nuevo", revision: [], registra: true },
  "msg-002": { clasificacion: "nuevo", revision: [], registra: true },
  "msg-003": { clasificacion: "actualizacion", revision: [], registra: true },
  "msg-004": { clasificacion: "duplicado", revision: [], registra: false },
  "msg-005": { clasificacion: "rechazado", revision: [], registra: false },
  "msg-006": { clasificacion: "nuevo", revision: ["valor", "fecha_inicio", "fecha_fin", "requiere_poliza"], registra: false },
}

async function main(): Promise<void> {
  limpiarOut(ctx)
  console.log(`\n═══ Demo reto 02 · fecha de referencia ${HOY} ═══\n`)

  const buzon = await llamar(contratos.leer_buzon.execute({}, ctx))
  const mensajes = (buzon.data?.mensajes ?? []) as { id: string; asunto: string; tiene_contrato: boolean }[]
  console.log(`Buzón: ${mensajes.length} mensajes pendientes`)
  verificar("leer_buzon lista los 6 mensajes", mensajes.length === 6)
  verificar("msg-005 (cotización) tiene_contrato = false", mensajes.find((m) => m.id === "msg-005")?.tiene_contrato === false)

  for (const m of mensajes) {
    console.log(`\n▸ ${m.id} · ${m.asunto}`)
    const v = await llamar(contratos.validar.execute({ mensaje_id: m.id }, ctx))
    const val = v.data as { clasificacion: string; motivo: string; requiere_revision: string[]; advertencias: string[] }
    console.log(`   clasificación: ${val.clasificacion} — ${val.motivo}`)
    if (val.requiere_revision.length) console.log(`   requiere revisión: ${val.requiere_revision.join(", ")}`)
    for (const a of val.advertencias) console.log(`   ⚠ ${a}`)

    const r = await llamar(contratos.registrar.execute({ mensaje_id: m.id }, ctx))
    console.log(`   acción: ${r.ok ? String(r.data?.accion) + (r.data?.ruta_archivo ? ` → ${String(r.data.ruta_archivo)}` : "") : `NO REGISTRADO · ${r.error}`}`)

    const e = ESPERADO[m.id]
    if (!e) continue
    verificar(`clasificación = ${e.clasificacion}`, val.clasificacion === e.clasificacion)
    verificar(`revisión = [${e.revision.join(", ")}]`, JSON.stringify(val.requiere_revision) === JSON.stringify(e.revision))
    const escribio = r.ok && ["nuevo", "actualizacion"].includes(String(r.data?.accion))
    verificar(e.registra ? "se escribe en el maestro" : "no se escribe en el maestro", escribio === e.registra)
  }

  console.log("\n▸ msg-006 · segunda llamada tras confirmación de la usuaria")
  console.log('   usuaria: "confirmo el valor 0 y la fecha fin 2027-08-31"')
  const c = await llamar(contratos.registrar.execute({ mensaje_id: "msg-006", confirmado: true, correcciones: { valor: 0, fecha_fin: "2027-08-31" } }, ctx))
  console.log(`   acción: ${c.ok ? `${String(c.data?.accion)} → ${String(c.data?.ruta_archivo)}` : c.error}`)
  verificar("msg-006 queda registrado con confirmado=true", c.ok && c.data?.accion === "nuevo")

  console.log("\n▸ Manejo de errores (HU-6)")
  const err = await llamar(contratos.extraer.execute({ mensaje_id: "msg-999" }, ctx))
  console.log(`   extraer msg-999 → ${err.error}`)
  verificar("mensaje inexistente devuelve { ok:false } sin lanzar", err.ok === false)

  console.log(`\n▸ Alertas con hoy = ${HOY}`)
  const a = await llamar(contratos.alertas.execute({ hoy: HOY }, ctx))
  const ids = (k: string) => ((a.data?.[k] ?? []) as { id_contrato: string }[]).map((x) => x.id_contrato).sort()
  for (const k of ["vencen", "polizas_pendientes", "registrados_desde_corte", "vencidos_sin_cierre"]) console.log(`   ${k}: ${ids(k).join(", ") || "-"}`)
  verificar("vencen = CT-2026-004, CT-2026-009", JSON.stringify(ids("vencen")) === JSON.stringify(["CT-2026-004", "CT-2026-009"]))
  verificar("pólizas pendientes = CM-2026-03, CT-2026-004, CT-2026-011, CT-2026-015", JSON.stringify(ids("polizas_pendientes")) === JSON.stringify(["CM-2026-03", "CT-2026-004", "CT-2026-011", "CT-2026-015"]))
  verificar("registrados desde el corte = CM-2026-03, CT-2026-011, CT-2026-015, CT-2026-016", JSON.stringify(ids("registrados_desde_corte")) === JSON.stringify(["CM-2026-03", "CT-2026-011", "CT-2026-015", "CT-2026-016"]))
  verificar("vencidos sin cierre = CT-2025-018, CT-2026-002", JSON.stringify(ids("vencidos_sin_cierre")) === JSON.stringify(["CT-2025-018", "CT-2026-002"]))

  console.log(`\nArchivos: out/sharepoint/maestro-contratos.csv · out/sharepoint/historial.jsonl · out/alertas.md · out/log.jsonl`)
  console.log(fallos === 0 ? "\n✅ Todos los criterios de aceptación se cumplen.\n" : `\n❌ ${fallos} criterio(s) fallaron.\n`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
