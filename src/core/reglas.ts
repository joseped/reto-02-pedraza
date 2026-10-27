// Parámetros de negocio (PRD §7.3). Cambiarlos no toca el servidor ni el ciclo del agente.

export const REGLAS = {
  /** RN5: por debajo de este valor el campo va a revisión humana. */
  umbralConfianza: 0.8,
  /** RN2: similitud mínima de objeto para tratar como actualización por NIT. */
  umbralSimilitudObjeto: 0.9,
  /** HU-5: ventana de alerta de vencimiento. */
  diasAlertaVencimiento: 60,
  /** Fecha en que se congeló el maestro. */
  fechaCorteMaestro: "2026-05-30",
  /** Identificador de Periferia: nunca es la contraparte. */
  nitPropio: "900123456",
  /** Máximo de caracteres del objeto en el maestro. */
  maxObjeto: 200,
} as const

/** Ciudad de domicilio → país (respaldo del identificador tributario). */
export const CIUDADES: Record<string, "CO" | "EC" | "PE" | "PA" | "HN"> = {
  bogota: "CO", medellin: "CO", barranquilla: "CO", cali: "CO", cartagena: "CO",
  quito: "EC", guayaquil: "EC", lima: "PE", panama: "PA", tegucigalpa: "HN", "san pedro sula": "HN",
}

/** Tipos de póliza normalizados (columna tipo_poliza, separada por ";"). */
export const TIPOS_POLIZA: Record<string, string> = {
  cumplimiento: "cumplimiento",
  calidad: "calidad",
  "responsabilidad civil": "responsabilidad_civil",
  "salarios y prestaciones": "salarios_prestaciones",
  "pago de salarios": "salarios_prestaciones",
  "buen manejo": "buen_manejo_anticipo",
}
