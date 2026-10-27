// Herramientas del agente. Cada export se expone al modelo como `contratos_<export>`.
// Contrato (PRD §6.2): devuelven string JSON { ok, data } | { ok:false, error } y nunca lanzan.

import { extname } from "node:path"
import { z } from "zod"
import { alertasMarkdown, calcularAlertas, type EntradaHistorial } from "../core/alertas.ts"
import { clasificar, type Validacion } from "../core/clasificador.ts"
import { extraerContrato } from "../core/extractor.ts"
import { hoyReferencia } from "../core/fechas.ts"
import { guardarFila, leerMaestro, siguienteAutoId } from "../core/maestro.ts"
import { Correcciones, Fecha, Fila, type ContratoExtraido, type Correo } from "../core/schema.ts"
import {
  agregarLinea, copiarArchivo, escribirAtomico, esAdjuntoContrato, leerAdjunto, leerComerciales, leerCorreo,
  leerJsonl, leerProcesados, listarMensajes, marcarProcesado, rutaAdjunto, rutas, type Ctx,
} from "../core/store.ts"
import { slug } from "../core/texto.ts"

type Salida = { ok: true; data: unknown; resumen: string } | { ok: false; error: string }

/** Envoltorio común: convierte cualquier excepción en { ok:false } y registra en out/log.jsonl (RN7). */
async function ejecutar(herramienta: string, ctx: Ctx, mensajeId: string | null, fn: () => Salida): Promise<string> {
  let salida: Salida
  try {
    salida = fn()
  } catch (e) {
    salida = { ok: false, error: `error interno en ${herramienta}: ${e instanceof Error ? e.message : String(e)}` }
  }
  const resumen = salida.ok ? salida.resumen : salida.error
  try {
    agregarLinea(rutas(ctx).log, { ts: new Date().toISOString(), herramienta, mensaje_id: mensajeId, ok: salida.ok, resumen })
  } catch {
    // Un fallo de log no debe tumbar la herramienta (P6).
  }
  return JSON.stringify(salida.ok ? { ok: true, data: salida.data } : { ok: false, error: salida.error })
}

const MensajeId = z.string().regex(/^[a-zA-Z0-9_-]+$/, "id de mensaje inválido").describe("Id del mensaje del buzón, p. ej. msg-001")

// ── Pipeline compartido: siempre se extrae del documento original (constitución P1) ──

type Evaluacion = { correo: Correo; adjunto: string | null; extraido: ContratoExtraido | null; validacion: Validacion }

function evaluar(ctx: Ctx, mensajeId: string): { ok: true; data: Evaluacion } | { ok: false; error: string } {
  const correo = leerCorreo(ctx, mensajeId)
  if (!correo) return { ok: false, error: `el mensaje ${mensajeId} no existe en el buzón o su correo.json es inválido` }
  const adjunto = correo.adjuntos.find(esAdjuntoContrato) ?? null
  if (!adjunto) {
    const motivo = `sin adjunto de contrato (adjuntos: ${correo.adjuntos.join(", ") || "ninguno"}) (RN4)`
    return { ok: true, data: { correo, adjunto, extraido: null, validacion: rechazo(motivo) } }
  }
  const texto = leerAdjunto(ctx, mensajeId, adjunto)
  if (texto === null) return { ok: false, error: `el adjunto ${adjunto} de ${mensajeId} no se encuentra` }
  const extraido = extraerContrato(texto, correo)
  if (!extraido.ok) return { ok: false, error: `${mensajeId}: ${extraido.error}` }
  const validacion = clasificar(extraido.data, leerMaestro(ctx), leerComerciales(ctx), correo, hoyReferencia())
  return { ok: true, data: { correo, adjunto, extraido: extraido.data, validacion } }
}

function rechazo(motivo: string): Validacion {
  return { clasificacion: "rechazado", motivo, id_contrato_existente: null, requiere_revision: [], detalle_revision: [], diferencias: [], advertencias: [], fila_propuesta: {} }
}

// ── Herramientas ─────────────────────────────────────────────────────────

export const leer_buzon = {
  description: "Lista los mensajes del buzón de contratos que aún no se han procesado, indicando si cada uno trae contrato.",
  args: {},
  async execute(_args: Record<string, never>, ctx: Ctx): Promise<string> {
    return ejecutar("contratos_leer_buzon", ctx, null, () => {
      const hechos = new Set(leerProcesados(ctx).map((p) => p.mensaje_id))
      const mensajes = listarMensajes(ctx)
        .filter((id) => !hechos.has(id))
        .map((id) => leerCorreo(ctx, id))
        .filter((c): c is Correo => c !== null)
        .map((c) => ({ id: c.id, de: c.de, asunto: c.asunto, fecha: c.fecha, adjuntos: c.adjuntos, tiene_contrato: c.adjuntos.some(esAdjuntoContrato) }))
      return { ok: true, data: { mensajes, ya_procesados: hechos.size }, resumen: `${mensajes.length} pendientes, ${hechos.size} ya procesados` }
    })
  },
}

export const extraer = {
  description: "Extrae del contrato adjunto los datos del maestro con un nivel de confianza por campo (null si el dato no está en el texto).",
  args: { mensaje_id: MensajeId },
  async execute(args: { mensaje_id: string }, ctx: Ctx): Promise<string> {
    return ejecutar("contratos_extraer", ctx, args.mensaje_id, () => {
      const r = evaluar(ctx, args.mensaje_id)
      if (!r.ok) return r
      if (!r.data.extraido) return { ok: false, error: `${args.mensaje_id} no trae contrato: ${r.data.validacion.motivo}. Clasifícalo con contratos_validar.` }
      const bajos = Object.entries(r.data.extraido).filter(([, v]) => typeof v === "object" && v !== null && "confianza" in v && v.confianza < 0.8).length
      return { ok: true, data: r.data.extraido, resumen: `${r.data.extraido.id_contrato.valor ?? "sin id"}: ${bajos} campos con confianza < 0.8` }
    })
  },
}

export const validar = {
  description: "Clasifica el mensaje como nuevo, actualizacion, duplicado o rechazado frente al maestro y lista los campos que requieren revisión humana.",
  args: {
    mensaje_id: MensajeId,
    contrato: z.unknown().optional().describe("Datos devueltos por contratos_extraer; informativo: la validación siempre vuelve a leer el documento original"),
  },
  async execute(args: { mensaje_id: string; contrato?: unknown }, ctx: Ctx): Promise<string> {
    return ejecutar("contratos_validar", ctx, args.mensaje_id, () => {
      const r = evaluar(ctx, args.mensaje_id)
      if (!r.ok) return r
      const v = r.data.validacion
      const rev = v.requiere_revision.length ? `, revisión: ${v.requiere_revision.join(", ")}` : ""
      return { ok: true, data: v, resumen: `${v.clasificacion}${rev}` }
    })
  },
}

export const registrar = {
  description: "Registra o actualiza el contrato en el maestro y lo archiva; si hay campos en revisión exige confirmado=true con la aprobación explícita de la usuaria.",
  args: {
    mensaje_id: MensajeId,
    contrato: z.unknown().optional().describe("Datos de contratos_extraer; informativo: los valores registrados salen del documento original"),
    confirmado: z.boolean().optional().describe("true solo si la usuaria confirmó explícitamente en su último mensaje los campos en revisión"),
    correcciones: Correcciones.optional().describe("Valores dictados por la usuaria para campos en revisión, p. ej. { fecha_fin: '2027-08-31' }"),
  },
  async execute(args: { mensaje_id: string; contrato?: unknown; confirmado?: boolean; correcciones?: Correcciones }, ctx: Ctx): Promise<string> {
    return ejecutar("contratos_registrar", ctx, args.mensaje_id, () => registrarMensaje(ctx, args.mensaje_id, args.confirmado === true, args.correcciones ?? {}))
  },
}

export const alertas = {
  description: "Genera out/alertas.md con contratos por vencer en 60 días, pólizas no vigentes, registros desde el corte y vencidos sin cierre.",
  args: { hoy: Fecha.describe("Fecha de referencia YYYY-MM-DD") },
  async execute(args: { hoy: string }, ctx: Ctx): Promise<string> {
    return ejecutar("contratos_alertas", ctx, null, () => {
      const r = rutas(ctx)
      const a = calcularAlertas(leerMaestro(ctx), leerJsonl<EntradaHistorial>(r.historial), args.hoy)
      escribirAtomico(r.alertas, alertasMarkdown(a, args.hoy))
      const ids = (fs: { id_contrato: string }[]) => fs.map((f) => f.id_contrato)
      const data = {
        ruta: "out/alertas.md",
        vencen: a.vencen.map((f) => ({ id_contrato: f.id_contrato, cliente: f.cliente, fecha_fin: f.fecha_fin })),
        polizas_pendientes: a.polizas_pendientes.map((f) => ({ id_contrato: f.id_contrato, cliente: f.cliente, tipo_poliza: f.tipo_poliza, estado_poliza: f.estado_poliza })),
        registrados_desde_corte: a.registrados_desde_corte,
        vencidos_sin_cierre: a.vencidos_sin_cierre.map((f) => ({ id_contrato: f.id_contrato, cliente: f.cliente, fecha_fin: f.fecha_fin })),
      }
      return { ok: true, data, resumen: `vencen ${ids(a.vencen).join(", ") || "-"} · pólizas ${ids(a.polizas_pendientes).join(", ") || "-"} · vencidos ${ids(a.vencidos_sin_cierre).join(", ") || "-"}` }
    })
  },
}

// ── Registro (R-13..R-17) ────────────────────────────────────────────────

function registrarMensaje(ctx: Ctx, mensajeId: string, confirmado: boolean, correcciones: Correcciones): Salida {
  const previo = leerProcesados(ctx).find((p) => p.mensaje_id === mensajeId)
  if (previo) return { ok: true, data: { id_contrato: previo.id_contrato, accion: "ya_procesado", clasificacion: previo.clasificacion, ruta_archivo: null }, resumen: `${mensajeId} ya estaba procesado` }

  const r = evaluar(ctx, mensajeId)
  if (!r.ok) return r
  const { validacion: v, adjunto } = r.data
  const hoy = hoyReferencia()
  const marcar = (id: string | null) => marcarProcesado(ctx, { mensaje_id: mensajeId, clasificacion: v.clasificacion, id_contrato: id, ts: new Date().toISOString() })

  if (v.clasificacion === "rechazado" || v.clasificacion === "duplicado") {
    marcar(v.id_contrato_existente)
    return { ok: true, data: { id_contrato: v.id_contrato_existente, accion: `sin escritura (${v.clasificacion})`, motivo: v.motivo, ruta_archivo: null }, resumen: `${v.clasificacion}: ${v.motivo}` }
  }
  if (v.requiere_revision.length > 0 && !confirmado) {
    return { ok: false, error: `requiere revisión: ${v.requiere_revision.join(", ")}. Pide confirmación explícita a la usuaria y vuelve a llamar con confirmado=true.` }
  }

  const filas = leerMaestro(ctx)
  const propuesta = ajustarPoliza({ ...v.fila_propuesta, ...correcciones }, correcciones)
  const id = propuesta.id_contrato ?? siguienteAutoId(filas, (propuesta.fecha_inicio ?? hoy).slice(0, 4))
  const ext = extname(adjunto ?? ".txt")
  const anio = (propuesta.fecha_inicio ?? hoy).slice(0, 4)
  const archivo = `Contratos/${anio}/${slug(propuesta.cliente ?? id)}/${id}${r.data.extraido?.es_otrosi ? `-otrosi-${mensajeId}` : ""}${ext}`
  const ruta = v.clasificacion === "nuevo" ? archivo : propuesta.ruta_sharepoint ?? archivo

  const fila = Fila.safeParse({ ...propuesta, id_contrato: id, ruta_sharepoint: ruta })
  if (!fila.success) {
    const faltan = fila.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return { ok: false, error: `no se puede registrar ${mensajeId}, datos incompletos o inválidos (${faltan}). Pide a la usuaria los valores y envíalos en correcciones.` }
  }

  guardarFila(ctx, fila.data)
  copiarArchivo(rutaAdjunto(ctx, mensajeId, adjunto ?? ""), `${rutas(ctx).sharepoint}/${archivo}`)
  const cambios = v.clasificacion === "nuevo" ? fila.data : v.diferencias
  agregarLinea(rutas(ctx).historial, {
    ts: new Date().toISOString(), fecha: hoy, id_contrato: id, accion: v.clasificacion, cambios, mensaje_id: mensajeId,
    archivo, confirmado_por: confirmado ? "usuario" : null, correcciones: Object.keys(correcciones).length ? correcciones : null,
  })
  marcar(id)
  return { ok: true, data: { id_contrato: id, accion: v.clasificacion, ruta_archivo: `out/sharepoint/${archivo}`, fila: fila.data }, resumen: `${v.clasificacion} ${id} → ${archivo}` }
}

/** Coherencia de póliza tras correcciones: sin póliza ⇒ tipo vacío y no_aplica; con póliza ⇒ al menos pendiente. */
function ajustarPoliza(p: Partial<Fila>, c: Correcciones): Partial<Fila> {
  if (p.requiere_poliza === false) return { ...p, tipo_poliza: c.tipo_poliza ?? "", estado_poliza: c.estado_poliza ?? "no_aplica" }
  if (p.requiere_poliza === true && (!p.estado_poliza || p.estado_poliza === "no_aplica")) return { ...p, estado_poliza: c.estado_poliza ?? "pendiente" }
  return p
}
