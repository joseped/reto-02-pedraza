// R-18 · Reporte de riesgos para gerencia.

import { sumarDias } from "./fechas.ts"
import { REGLAS } from "./reglas.ts"
import type { Fila } from "./schema.ts"

export type EntradaHistorial = { ts: string; id_contrato: string; accion: string; mensaje_id: string; fecha: string }

export type Alertas = {
  vencen: Fila[]
  polizas_pendientes: Fila[]
  registrados_desde_corte: { id_contrato: string; cliente: string; accion: string; fecha: string }[]
  vencidos_sin_cierre: Fila[]
}

export function calcularAlertas(filas: Fila[], historial: EntradaHistorial[], hoy: string): Alertas {
  const limite = sumarDias(hoy, REGLAS.diasAlertaVencimiento)
  const porFin = (a: Fila, b: Fila) => a.fecha_fin.localeCompare(b.fecha_fin)
  const cliente = (id: string) => filas.find((f) => f.id_contrato === id)?.cliente ?? ""
  return {
    vencen: filas.filter((f) => f.fecha_fin >= hoy && f.fecha_fin <= limite).sort(porFin),
    polizas_pendientes: filas.filter((f) => f.requiere_poliza && f.estado_poliza !== "vigente").sort(porFin),
    registrados_desde_corte: historial
      .filter((h) => h.fecha >= REGLAS.fechaCorteMaestro)
      .map((h) => ({ id_contrato: h.id_contrato, cliente: cliente(h.id_contrato), accion: h.accion, fecha: h.fecha })),
    vencidos_sin_cierre: filas.filter((f) => f.fecha_fin < hoy).sort(porFin),
  }
}

const fmt = (n: number) => n.toLocaleString("es-CO")

function tabla(filas: Fila[], cols: [string, (f: Fila) => string][]): string {
  if (filas.length === 0) return "_Sin registros._\n"
  const cab = `| ${cols.map(([t]) => t).join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`
  return cab + filas.map((f) => `| ${cols.map(([, g]) => g(f)).join(" | ")} |`).join("\n") + "\n"
}

export function alertasMarkdown(a: Alertas, hoy: string): string {
  const basicas: [string, (f: Fila) => string][] = [
    ["Contrato", (f) => f.id_contrato],
    ["Cliente", (f) => f.cliente],
    ["Fin", (f) => f.fecha_fin],
    ["Valor", (f) => `${f.moneda} ${fmt(f.valor)}`],
    ["Comercial", (f) => f.comercial],
  ]
  const gap = a.registrados_desde_corte
  return [
    `# Alertas de contratos · ${hoy}\n`,
    `## 1. Vencen en ≤ ${REGLAS.diasAlertaVencimiento} días (hasta ${sumarDias(hoy, REGLAS.diasAlertaVencimiento)})\n`,
    tabla(a.vencen, basicas),
    `## 2. Pólizas exigidas y no vigentes\n`,
    tabla(a.polizas_pendientes, [...basicas.slice(0, 3), ["Tipo", (f) => f.tipo_poliza], ["Estado", (f) => f.estado_poliza]]),
    `## 3. Registrados por el buzón desde el corte (${REGLAS.fechaCorteMaestro})\n`,
    gap.length === 0
      ? "_Sin registros._\n"
      : "| Contrato | Cliente | Acción | Fecha |\n|---|---|---|---|\n" + gap.map((g) => `| ${g.id_contrato} | ${g.cliente} | ${g.accion} | ${g.fecha} |`).join("\n") + "\n",
    `## 4. Vencidos que siguen en el maestro sin cierre\n`,
    "_Adicional al PRD: requieren acta de terminación, liquidación o prórroga._\n\n" + tabla(a.vencidos_sin_cierre, basicas),
  ].join("\n")
}
