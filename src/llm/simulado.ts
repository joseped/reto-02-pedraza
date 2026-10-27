// Proveedor "simulado": guion determinista que llama a las herramientas reales sin un LLM.
// Uso: QA end-to-end gratis y reproducible (LLM_PROVIDER=simulado). Demuestra además que
// cambiar de proveedor no toca el ciclo del agente (PRD §6.1).

import type { DefinicionHerramienta, LlamadaHerramienta, LlmAdapter, RespuestaLlm, Turno } from "./adapter.ts"

type Hecha = { nombre: string; args: Record<string, unknown>; ok: boolean; data: Record<string, unknown> }

let secuencia = 0
const llamar = (pasos: { nombre: string; args: Record<string, unknown> }[]): RespuestaLlm => ({
  texto: "",
  llamadas: pasos.map((p): LlamadaHerramienta => ({ id: `sim-${++secuencia}`, nombre: p.nombre, args: p.args })),
  fin: "herramientas",
  tokens: 0,
  crudo: undefined,
})
const responder = (texto: string): RespuestaLlm => ({ texto, llamadas: [], fin: "fin", tokens: 0, crudo: undefined })

/** Llamadas ya ejecutadas (con su resultado) desde el turno indicado. */
function hechasDesde(turnos: Turno[], desde: number): Hecha[] {
  const porId = new Map<string, { nombre: string; args: Record<string, unknown> }>()
  const hechas: Hecha[] = []
  turnos.slice(desde + 1).forEach((t) => {
    if (t.rol === "asistente") t.llamadas.forEach((l) => porId.set(l.id, { nombre: l.nombre, args: (l.args ?? {}) as Record<string, unknown> }))
    if (t.rol === "resultados")
      for (const r of t.resultados) {
        const l = porId.get(r.id)
        const salida = JSON.parse(r.contenido) as { ok: boolean; data?: Record<string, unknown> }
        if (l) hechas.push({ ...l, ok: salida.ok, data: salida.data ?? {} })
      }
  })
  return hechas
}

export class SimuladoAdapter implements LlmAdapter {
  readonly proveedor = "simulado"
  readonly modelo = "guion-determinista"

  async enviar(_system: string, turnos: Turno[], _herramientas: DefinicionHerramienta[]): Promise<RespuestaLlm> {
    const iu = turnos.map((t) => t.rol).lastIndexOf("usuario")
    const ultimo = turnos[iu]
    const mensaje = ultimo?.rol === "usuario" ? ultimo.texto : ""
    const turno = hechasDesde(turnos, iu)
    if (/buz[oó]n/i.test(mensaje)) return procesarBuzon(mensaje, turno)
    if (/confirm/i.test(mensaje)) return confirmar(mensaje, turno, hechasDesde(turnos, -1))
    return responder(`(modelo simulado) Puedo procesar el buzón o registrar una confirmación. Recibí: ${mensaje}`)
  }
}

function procesarBuzon(mensaje: string, hechas: Hecha[]): RespuestaLlm {
  const hoy = /\d{4}-\d{2}-\d{2}/.exec(mensaje)?.[0] ?? "2026-09-03"
  const buzon = hechas.find((h) => h.nombre === "contratos_leer_buzon")
  if (!buzon) return llamar([{ nombre: "contratos_leer_buzon", args: {} }])

  const ids = ((buzon.data.mensajes ?? []) as { id: string }[]).map((m) => m.id)
  const validados = hechas.filter((h) => h.nombre === "contratos_validar")
  if (ids.length && validados.length === 0) return llamar(ids.map((id) => ({ nombre: "contratos_validar", args: { mensaje_id: id } })))

  const limpios = validados.filter((v) => v.ok && ((v.data.requiere_revision ?? []) as string[]).length === 0)
  if (limpios.length && !hechas.some((h) => h.nombre === "contratos_registrar"))
    return llamar(limpios.map((v) => ({ nombre: "contratos_registrar", args: { mensaje_id: v.args.mensaje_id } })))
  if (!hechas.some((h) => h.nombre === "contratos_alertas")) return llamar([{ nombre: "contratos_alertas", args: { hoy } }])

  const filas = validados.map((v) => `| ${String(v.args.mensaje_id)} | ${String(v.data.clasificacion)} | ${((v.data.requiere_revision ?? []) as string[]).join(", ") || "—"} |`)
  const pendientes = validados.filter((v) => ((v.data.requiere_revision ?? []) as string[]).length > 0).map((v) => String(v.args.mensaje_id))
  return responder(
    [
      `Procesé ${ids.length} mensajes con fecha ${hoy}.`,
      "",
      "| Mensaje | Clasificación | Revisión |",
      "|---|---|---|",
      ...filas,
      "",
      pendientes.length ? `**¿Confirmas registrar ${pendientes.join(", ")} con los valores propuestos?**` : "No queda nada pendiente.",
    ].join("\n"),
  )
}

function confirmar(mensaje: string, turno: Hecha[], todas: Hecha[]): RespuestaLlm {
  const registrados = new Set(todas.filter((h) => h.nombre === "contratos_registrar" && h.ok).map((h) => h.args.mensaje_id))
  const pendiente = todas.filter((h) => h.nombre === "contratos_validar" && ((h.data.requiere_revision ?? []) as string[]).length > 0 && !registrados.has(h.args.mensaje_id)).at(-1)
  const intento = turno.find((h) => h.nombre === "contratos_registrar")
  if (!intento && pendiente) {
    const valor = /valor\s+(\d+)/i.exec(mensaje)?.[1]
    const fin = /fecha fin\s+(\d{4}-\d{2}-\d{2})/i.exec(mensaje)?.[1]
    const correcciones = { ...(valor !== undefined ? { valor: Number(valor) } : {}), ...(fin ? { fecha_fin: fin } : {}) }
    return llamar([{ nombre: "contratos_registrar", args: { mensaje_id: pendiente.args.mensaje_id, confirmado: true, correcciones } }])
  }
  const alertasPrevias = todas.find((h) => h.nombre === "contratos_alertas")
  if (intento?.ok && alertasPrevias && !turno.some((h) => h.nombre === "contratos_alertas")) return llamar([{ nombre: "contratos_alertas", args: alertasPrevias.args }])
  if (!intento) return responder("No hay ningún mensaje pendiente de confirmación.")
  return responder(intento.ok ? `Registré ${String(intento.data.id_contrato)} y regeneré las alertas.` : `No se registró: ${JSON.stringify(intento.data)}`)
}
