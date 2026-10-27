// Interfaz propia del proveedor LLM (PRD §6.1). El ciclo del agente solo conoce estos tipos.

export type LlamadaHerramienta = { id: string; nombre: string; args: unknown }
export type ResultadoHerramienta = { id: string; contenido: string; error: boolean }

/** Historial neutral. `crudo` guarda el contenido nativo del proveedor para reenviarlo intacto. */
export type Turno =
  | { rol: "usuario"; texto: string }
  | { rol: "asistente"; texto: string; llamadas: LlamadaHerramienta[]; crudo?: unknown }
  | { rol: "resultados"; resultados: ResultadoHerramienta[] }

export type DefinicionHerramienta = { nombre: string; descripcion: string; esquema: Record<string, unknown> }

export type RespuestaLlm = {
  texto: string
  llamadas: LlamadaHerramienta[]
  fin: "fin" | "herramientas" | "limite" | "rechazo"
  tokens: number
  crudo: unknown
}

export interface LlmAdapter {
  readonly proveedor: string
  readonly modelo: string
  enviar(system: string, turnos: Turno[], herramientas: DefinicionHerramienta[]): Promise<RespuestaLlm>
}

/** Error del proveedor ya traducido a lenguaje claro (CA5). */
export class ErrorLlm extends Error {}
