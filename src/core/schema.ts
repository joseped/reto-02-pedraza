// Esquemas zod compartidos. El maestro (PRD §7.2) es la forma canónica.

import { z } from "zod"
import { esIsoValida } from "./fechas.ts"

export const Pais = z.enum(["CO", "EC", "PE", "PA", "HN"])
export const Moneda = z.enum(["COP", "USD", "PEN", "PAB", "HNL"])
export const EstadoPoliza = z.enum(["vigente", "pendiente", "vencida", "no_aplica"])
export const Fecha = z.string().refine(esIsoValida, "fecha inválida, se espera YYYY-MM-DD")

export const Fila = z.object({
  id_contrato: z.string().min(1),
  cliente: z.string().min(1),
  nit_cliente: z.string().regex(/^\d+$/, "solo dígitos, sin puntos ni DV"),
  pais: Pais,
  objeto: z.string().min(1).max(200),
  valor: z.number().nonnegative(),
  moneda: Moneda,
  fecha_inicio: Fecha,
  fecha_fin: Fecha,
  requiere_poliza: z.boolean(),
  tipo_poliza: z.string(),
  estado_poliza: EstadoPoliza,
  comercial: z.string(),
  ruta_sharepoint: z.string(),
  fecha_registro: Fecha,
  fuente: z.enum(["buzon", "manual", "migracion"]),
})
export type Fila = z.infer<typeof Fila>
export const COLUMNAS = Object.keys(Fila.shape) as (keyof Fila)[]

/** Campos que la usuaria puede corregir al confirmar (R-14). */
export const Correcciones = Fila.pick({
  id_contrato: true, cliente: true, nit_cliente: true, pais: true, objeto: true,
  valor: true, moneda: true, fecha_inicio: true, fecha_fin: true,
  requiere_poliza: true, tipo_poliza: true, estado_poliza: true,
}).partial()
export type Correcciones = z.infer<typeof Correcciones>

export const Correo = z.object({
  id: z.string(),
  de: z.string(),
  para: z.string().optional(),
  asunto: z.string(),
  fecha: z.string(),
  cuerpo: z.string(),
  adjuntos: z.array(z.string()),
})
export type Correo = z.infer<typeof Correo>

export const Comercial = z.object({ email: z.string(), nombre: z.string(), region: z.string() })
export type Comercial = z.infer<typeof Comercial>

export type Campo<T> = { valor: T | null; confianza: number; fuente: string }

export type ContratoExtraido = {
  id_contrato: Campo<string>
  cliente: Campo<string>
  nit_cliente: Campo<string>
  pais: Campo<z.infer<typeof Pais>>
  objeto: Campo<string>
  valor: Campo<number>
  moneda: Campo<z.infer<typeof Moneda>>
  fecha_inicio: Campo<string>
  fecha_fin: Campo<string>
  requiere_poliza: Campo<boolean>
  tipo_poliza: Campo<string>
  es_otrosi: boolean
  valor_indeterminado: boolean
  amplia_garantias: boolean
  notas: string[]
}

/** Campos con confianza que se evalúan para revisión (RN5). */
export const CAMPOS_EVALUADOS = [
  "id_contrato", "cliente", "nit_cliente", "pais", "objeto", "valor", "moneda",
  "fecha_inicio", "fecha_fin", "requiere_poliza",
] as const
export type CampoEvaluado = (typeof CAMPOS_EVALUADOS)[number]
