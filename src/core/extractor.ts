// R-03..R-08, R-12 · Extracción determinista con confianza por campo.
// Principio P2: un dato que no está en el texto es null con confianza 0.

import { fechaFirma, fechasEnTexto, finDePlazo, plazoMeses } from "./fechas.ts"
import { parseMonto } from "./numeros.ts"
import { CIUDADES, REGLAS, TIPOS_POLIZA } from "./reglas.ts"
import { Moneda, type Campo, type ContratoExtraido, type Correo } from "./schema.ts"
import { normalizar, parrafos, recortar } from "./texto.ts"

type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }
type PaisCod = NonNullable<ContratoExtraido["pais"]["valor"]>
type MonedaCod = NonNullable<ContratoExtraido["moneda"]["valor"]>

const campo = <T>(valor: T | null, confianza: number, fuente: string): Campo<T> => ({
  valor,
  confianza: valor === null ? 0 : confianza,
  fuente,
})

const parrafoCon = (ps: string[], patron: RegExp) => ps.find((p) => patron.test(p)) ?? null

export function extraerContrato(texto: string, correo: Correo): Resultado<ContratoExtraido> {
  if (!texto.trim()) return { ok: false, error: "el documento está vacío" }

  const ps = parrafos(texto)
  const esOtrosi = /^OTROS[IÍ]/i.test(ps[0] ?? "")
  const notas: string[] = []

  const valor = extraerValor(parrafoCon(ps, /\bVALOR\b/), texto)
  if (!valor.ok) return valor
  const parte = extraerContraparte(parrafoCon(ps, /^Entre\b/) ?? "", texto)
  const fechas = extraerFechas(parrafoCon(ps, /\bPLAZO\b/), texto, esOtrosi, notas)
  const poliza = extraerPoliza(ps, correo, esOtrosi)
  if (valor.data.indeterminado) notas.push("valor: el contrato no fija un valor (por demanda); se propone 0")
  if (poliza.condicional) notas.push("póliza: exigida solo para algunas órdenes; requiere criterio humano")
  if (poliza.amplia) notas.push("otrosí: exige ampliar la vigencia de las garantías")

  return {
    ok: true,
    data: {
      id_contrato: extraerId(ps[0] ?? "", esOtrosi),
      cliente: parte.cliente,
      nit_cliente: parte.nit,
      pais: parte.pais,
      objeto: esOtrosi ? campo<string>(null, 0, "otrosí: no modifica el objeto") : extraerObjeto(parrafoCon(ps, /\bOBJETO\b/)),
      valor: valor.data.valor,
      moneda: valor.data.moneda,
      fecha_inicio: fechas.inicio,
      fecha_fin: fechas.fin,
      requiere_poliza: poliza.requiere,
      tipo_poliza: poliza.tipo,
      es_otrosi: esOtrosi,
      valor_indeterminado: valor.data.indeterminado,
      amplia_garantias: poliza.amplia,
      notas,
    },
  }
}

function extraerId(encabezado: string, esOtrosi: boolean): Campo<string> {
  const patron = esOtrosi ? /AL CONTRATO[^\n]*?No\.\s*([A-Z]{2,3}-\d{4}-\d+)/i : /No\.\s*([A-Z]{2,3}-\d{4}-\d+)/i
  const m = patron.exec(encabezado)
  return campo(m?.[1] ?? null, 0.95, esOtrosi ? "encabezado del otrosí (contrato referenciado)" : "encabezado")
}

function extraerContraparte(partes: string, texto: string) {
  const patron = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .&]+?),\s*(?:identificada con\s+)?(NIT|RUC|RTN)\s+([\d.\-]*\d)/g
  for (const m of partes.matchAll(patron)) {
    const nit = (m[3] ?? "").split("-")[0]!.replace(/\./g, "")
    if (nit === REGLAS.nitPropio) continue
    const nombreMayus = (m[1] ?? "").trim()
    const firmado = nombreEnFirmas(nombreMayus, texto)
    const resto = partes.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 120)
    return {
      cliente: firmado
        ? campo(firmado, 0.95, "cláusula de partes + bloque de firmas")
        : campo(nombreMayus, 0.7, "cláusula de partes (no coincide con firmas)"),
      nit: campo(nit, 0.95, `${m[2]} en cláusula de partes`),
      pais: inferirPais(m[2] ?? "", nit, resto),
    }
  }
  return {
    cliente: campo<string>(null, 0, "no se identificó la contraparte"),
    nit: campo<string>(null, 0, "no se identificó identificador tributario"),
    pais: campo<PaisCod>(null, 0, "sin identificador ni domicilio"),
  }
}

/** Busca el nombre en el bloque de firmas para obtenerlo con mayúsculas y minúsculas reales. */
function nombreEnFirmas(nombreMayus: string, texto: string): string | null {
  const objetivo = normalizar(nombreMayus)
  for (const linea of texto.split("\n")) {
    for (const segmento of linea.split(/\s{2,}/)) {
      const s = segmento.trim()
      if (s && s !== s.toUpperCase() && normalizar(s) === objetivo) return s
    }
  }
  return null
}

function inferirPais(tipo: string, id: string, contexto: string): Campo<PaisCod> {
  const porId: PaisCod = tipo === "NIT" ? "CO" : tipo === "RTN" ? "HN" : id.length === 13 ? "EC" : id.length === 11 ? "PE" : "PA"
  const domicilio = /domicilio en ([^,(]+)/i.exec(contexto)?.[1] ?? ""
  const ciudad = Object.keys(CIUDADES).find((c) => normalizar(domicilio).includes(c))
  const porCiudad = ciudad ? CIUDADES[ciudad] : null
  if (porCiudad && porCiudad !== porId) return campo(porCiudad, 0.6, `conflicto: ${tipo} sugiere ${porId}, domicilio sugiere ${porCiudad}`)
  return campo(porId, porCiudad ? 0.95 : 0.85, porCiudad ? `${tipo} + domicilio` : `${tipo} (sin domicilio)`)
}

function extraerObjeto(p: string | null): Campo<string> {
  if (!p) return campo<string>(null, 0, "sin cláusula OBJETO")
  const cuerpo = p
    .replace(/^.*?\bOBJETO\.\s*/s, "")
    .replace(/^EL CONTRATISTA\s+(se obliga a|prestará)\s+/i, "")
    .trim()
  const texto = cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1)
  return campo(recortar(texto, REGLAS.maxObjeto), 0.9, "cláusula OBJETO")
}

function extraerValor(p: string | null, texto: string): Resultado<{ valor: Campo<number>; moneda: Campo<MonedaCod>; indeterminado: boolean }> {
  if (!p) {
    return { ok: true, data: { valor: campo<number>(null, 0, "sin cláusula VALOR"), moneda: campo<MonedaCod>(null, 0, "sin cláusula VALOR"), indeterminado: false } }
  }
  if (/no tiene un valor determinado|valor indeterminado|por demanda/i.test(p)) {
    return { ok: true, data: { valor: campo(0, 0.5, "contrato sin valor determinado → 0 (PRD §7.2)"), moneda: monedaMencionada(texto), indeterminado: true } }
  }
  const m = /\(\s*([A-Z]{3})\s*\$?\s*([\d.,]*\d)\s*\)/.exec(p)
  if (!m) return { ok: true, data: { valor: campo<number>(null, 0, "no hay cifra en la cláusula VALOR"), moneda: campo<MonedaCod>(null, 0, "sin código de moneda"), indeterminado: false } }
  const moneda = Moneda.safeParse(m[1])
  if (!moneda.success) return { ok: false, error: `moneda desconocida "${m[1]}"; válidas: ${Moneda.options.join(", ")}` }
  return { ok: true, data: { valor: campo(parseMonto(m[2] ?? ""), 0.95, "cifra en cláusula VALOR"), moneda: campo(moneda.data, 0.95, "código de moneda"), indeterminado: false } }
}

/** Contrato sin valor: la moneda solo se acepta si el texto la nombra (p. ej. en las garantías). */
function monedaMencionada(texto: string): Campo<MonedaCod> {
  const codigo = Moneda.options.find((m) => new RegExp(`\\b${m}\\b`).test(texto))
  if (codigo) return campo(codigo, 0.85, "moneda mencionada en el contrato")
  return campo<MonedaCod>(null, 0, "el contrato no menciona moneda")
}

function extraerFechas(p: string | null, texto: string, esOtrosi: boolean, notas: string[]) {
  const nada = { inicio: campo<string>(null, 0, "sin cláusula PLAZO"), fin: campo<string>(null, 0, "sin cláusula PLAZO") }
  if (!p) return nada
  const fechas = fechasEnTexto(p)
  const meses = plazoMeses(p)

  if (esOtrosi) {
    return { inicio: campo<string>(null, 0, "otrosí: no modifica el inicio"), fin: campo(fechas.at(-1) ?? null, 0.9, "nueva fecha en cláusula PLAZO del otrosí") }
  }
  if (fechas.length >= 2) {
    const [inicio, fin] = fechas as [string, string]
    const coincide = meses === null || finDePlazo(inicio, meses) === fin
    if (!coincide) notas.push(`plazo: ${meses} meses no coincide con ${inicio} → ${fin}`)
    const conf = coincide ? 0.95 : 0.7
    return { inicio: campo(inicio, conf, "fechas explícitas en PLAZO"), fin: campo(fin, conf, "fechas explícitas en PLAZO") }
  }
  const firma = fechaFirma(texto)
  if (meses !== null && firma && /firma/i.test(p)) {
    const fin = finDePlazo(firma.fecha, meses)
    notas.push(`plazo: ${meses} meses desde la firma (${firma.soloMes ? "solo se conoce el mes" : firma.fecha}); fecha fin derivada`)
    return {
      inicio: campo(firma.fecha, firma.soloMes ? 0.5 : 0.85, firma.soloMes ? "firma sin día: se asume el día 1" : "fecha de firma"),
      fin: campo(fin, 0.6, `derivada: inicio + ${meses} meses − 1 día`),
    }
  }
  return nada
}

function extraerPoliza(ps: string[], correo: Correo, esOtrosi: boolean) {
  const garantias = ps.filter((p) => /GARANT[IÍ]A|p[oó]liza/i.test(p)).join("\n")
  const amplia = esOtrosi && /ampliar/i.test(garantias)
  const sinDato = { requiere: campo<boolean>(null, 0, "otrosí: no modifica la póliza"), tipo: campo<string>(null, 0, "otrosí: no modifica la póliza"), condicional: false, amplia }
  if (esOtrosi) return sinDato

  const cuerpo = normalizar(correo.cuerpo)
  const correoNiega = /no (pide|requiere|lleva) poliza/.test(cuerpo)
  const correoAfirma = !correoNiega && /(requiere|pide|lleva) poliza/.test(cuerpo)

  if (!/p[oó]liza/i.test(garantias)) {
    const conf = correoNiega ? 0.95 : correoAfirma ? 0.5 : 0.85
    const fuente = correoAfirma ? "conflicto: el contrato no trae garantías pero el correo dice que requiere póliza" : "sin cláusula de garantías"
    return { requiere: campo(false, conf, fuente), tipo: campo("", conf, fuente), condicional: false, amplia }
  }
  const norm = normalizar(garantias)
  const tipos = [...new Set(Object.entries(TIPOS_POLIZA).filter(([k]) => norm.includes(k)).map(([, v]) => v))]
  const condicional = /para cada orden|cuyo valor supere|en caso de que|si el valor/.test(norm)
  const conf = condicional ? 0.6 : correoNiega ? 0.5 : 0.95
  const fuente = condicional ? "póliza condicional (solo para algunas órdenes)" : "cláusula de garantías"
  return { requiere: campo(true, conf, fuente), tipo: campo(tipos.join(";"), conf, fuente), condicional, amplia }
}
