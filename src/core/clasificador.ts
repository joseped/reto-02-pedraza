// R-09..R-12 · Clasificación contra el maestro (RN1–RN4) y campos que requieren revisión (RN5).

import { REGLAS } from "./reglas.ts"
import { CAMPOS_EVALUADOS, type CampoEvaluado, type Comercial, type ContratoExtraido, type Correo, type Fila } from "./schema.ts"
import { similitud } from "./texto.ts"

export type Clasificacion = "nuevo" | "actualizacion" | "duplicado" | "rechazado"
export type Diferencia = { campo: keyof Fila; antes: unknown; despues: unknown }
export type DetalleRevision = { campo: string; valor_propuesto: unknown; confianza: number; motivo: string }

export type Validacion = {
  clasificacion: Clasificacion
  motivo: string
  id_contrato_existente: string | null
  requiere_revision: string[]
  detalle_revision: DetalleRevision[]
  diferencias: Diferencia[]
  advertencias: string[]
  /** Fila tal como quedaría; puede estar incompleta si faltan datos (se completa con correcciones). */
  fila_propuesta: Partial<Fila>
}

const IDENTIDAD: CampoEvaluado[] = ["nit_cliente", "pais"]

export function clasificar(c: ContratoExtraido, filas: Fila[], comerciales: Comercial[], correo: Correo, hoy: string): Validacion {
  const advertencias = [...c.notas]
  const comercial = resolverComercial(correo, comerciales, advertencias)

  if (c.cliente.valor === null && c.objeto.valor === null && !c.es_otrosi) {
    return base("rechazado", "el texto no contiene partes ni objeto identificables (RN4)", advertencias)
  }

  const porId = filas.find((f) => f.id_contrato === c.id_contrato.valor)
  if (porId && !c.es_otrosi && esDuplicado(c, porId)) {
    return { ...base("duplicado", `ya existe ${porId.id_contrato} con el mismo valor y fechas (RN1); no se escribe nada`, advertencias), id_contrato_existente: porId.id_contrato, fila_propuesta: porId }
  }
  const existente = porId ?? porNitYObjeto(c, filas)
  if (existente) return actualizacion(c, existente, advertencias, porId ? "mismo id_contrato" : "mismo NIT y objeto similar")

  avisarMismoCliente(c, filas, advertencias)
  return nuevo(c, comercial, hoy, advertencias)
}

function base(clasificacion: Clasificacion, motivo: string, advertencias: string[]): Validacion {
  return { clasificacion, motivo, id_contrato_existente: null, requiere_revision: [], detalle_revision: [], diferencias: [], advertencias, fila_propuesta: {} }
}

function resolverComercial(correo: Correo, comerciales: Comercial[], advertencias: string[]): string {
  const email = correo.de.trim().toLowerCase()
  const encontrado = comerciales.find((x) => x.email.toLowerCase() === email)
  if (encontrado) return encontrado.nombre
  advertencias.push(`remitente ${email} no está en comerciales.json; se registra igual (no bloquea)`)
  return `${email} (no registrado)`
}

function esDuplicado(c: ContratoExtraido, f: Fila): boolean {
  return c.valor.valor === f.valor && c.fecha_inicio.valor === f.fecha_inicio && c.fecha_fin.valor === f.fecha_fin
}

function porNitYObjeto(c: ContratoExtraido, filas: Fila[]): Fila | undefined {
  if (!c.nit_cliente.valor || !c.objeto.valor) return undefined
  return filas.find((f) => f.nit_cliente === c.nit_cliente.valor && similitud(f.objeto, c.objeto.valor ?? "") >= REGLAS.umbralSimilitudObjeto)
}

function avisarMismoCliente(c: ContratoExtraido, filas: Fila[], advertencias: string[]): void {
  for (const f of filas.filter((x) => x.nit_cliente === c.nit_cliente.valor)) {
    const s = similitud(f.objeto, c.objeto.valor ?? "").toFixed(2)
    advertencias.push(`el cliente ya tiene ${f.id_contrato} ("${f.objeto}"), pero el objeto es distinto (similitud ${s}); se trata como contrato nuevo`)
  }
}

function revision(c: ContratoExtraido, campos: readonly CampoEvaluado[]): DetalleRevision[] {
  return campos
    .filter((k) => c[k].confianza < REGLAS.umbralConfianza)
    .map((k) => ({ campo: k, valor_propuesto: c[k].valor, confianza: c[k].confianza, motivo: c[k].fuente }))
}

function nuevo(c: ContratoExtraido, comercial: string, hoy: string, advertencias: string[]): Validacion {
  // Sin número de contrato se asigna AUTO-<año>-<n> al registrar: es una regla, no una duda.
  const evaluados = CAMPOS_EVALUADOS.filter((k) => !(k === "id_contrato" && c.id_contrato.valor === null))
  const detalle = revision(c, evaluados)
  const requiere = c.requiere_poliza.valor
  return {
    ...base("nuevo", "no hay coincidencia en el maestro (RN3)", advertencias),
    requiere_revision: detalle.map((d) => d.campo),
    detalle_revision: detalle,
    fila_propuesta: {
      ...(c.id_contrato.valor ? { id_contrato: c.id_contrato.valor } : {}),
      ...valoresDe(c),
      tipo_poliza: requiere ? c.tipo_poliza.valor ?? "" : "",
      estado_poliza: requiere === null ? undefined : requiere ? "pendiente" : "no_aplica",
      comercial,
      fecha_registro: hoy,
      fuente: "buzon",
    },
  }
}

function actualizacion(c: ContratoExtraido, f: Fila, advertencias: string[], criterio: string): Validacion {
  const propuesta: Fila = { ...f }
  const diferencias: Diferencia[] = []
  const conflictos: DetalleRevision[] = []
  const valores = valoresDe(c)

  for (const k of CAMPOS_EVALUADOS) {
    const nuevoValor = valores[k as keyof typeof valores]
    if (nuevoValor === undefined || k === "id_contrato" || nuevoValor === f[k]) continue
    if (IDENTIDAD.includes(k)) {
      conflictos.push({ campo: `conflicto:${k}`, valor_propuesto: nuevoValor, confianza: 0, motivo: `el maestro tiene ${String(f[k])}` })
    } else if (k === "cliente") {
      advertencias.push(`razón social distinta al maestro ("${String(nuevoValor)}" vs "${f.cliente}"); se conserva la del maestro`)
    } else {
      diferencias.push({ campo: k, antes: f[k], despues: nuevoValor })
      Object.assign(propuesta, { [k]: nuevoValor })
    }
  }
  if (c.amplia_garantias && f.requiere_poliza && f.estado_poliza !== "pendiente") {
    diferencias.push({ campo: "estado_poliza", antes: f.estado_poliza, despues: "pendiente" })
    propuesta.estado_poliza = "pendiente"
  }
  const modificados = CAMPOS_EVALUADOS.filter((k) => k !== "cliente" && valores[k as keyof typeof valores] !== undefined)
  const detalle = [...revision(c, modificados), ...conflictos]
  const tipo = c.es_otrosi ? "otrosí" : criterio
  return {
    ...base("actualizacion", `${tipo} sobre ${f.id_contrato} (RN2)`, advertencias),
    id_contrato_existente: f.id_contrato,
    requiere_revision: detalle.map((d) => d.campo),
    detalle_revision: detalle,
    diferencias,
    fila_propuesta: propuesta,
  }
}

/** Valores extraídos no nulos, con la forma de la fila del maestro. */
function valoresDe(c: ContratoExtraido): Partial<Fila> {
  const v: Partial<Fila> = {}
  for (const k of CAMPOS_EVALUADOS) {
    const valor = c[k].valor
    if (valor !== null) Object.assign(v, { [k]: valor })
  }
  return v
}
