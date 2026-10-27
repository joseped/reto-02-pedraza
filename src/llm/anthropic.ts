// Implementación del adaptador para Anthropic. Cambiar de proveedor = escribir otro archivo como este.

import Anthropic from "@anthropic-ai/sdk"
import { ErrorLlm, type DefinicionHerramienta, type LlmAdapter, type RespuestaLlm, type Turno } from "./adapter.ts"

type Mensaje = Anthropic.Beta.BetaMessageParam

export class AnthropicAdapter implements LlmAdapter {
  readonly proveedor = "anthropic"
  private readonly cliente: Anthropic

  constructor(readonly modelo: string, timeoutMs: number) {
    // La clave se lee de ANTHROPIC_API_KEY dentro del SDK; nunca pasa por nuestro código ni por logs.
    this.cliente = new Anthropic({ timeout: timeoutMs, maxRetries: 2 })
  }

  async enviar(system: string, turnos: Turno[], herramientas: DefinicionHerramienta[]): Promise<RespuestaLlm> {
    try {
      const r = await this.cliente.beta.messages.create({
        model: this.modelo,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, input_schema: h.esquema as Anthropic.Beta.BetaTool.InputSchema })),
        messages: turnos.map(aMensaje),
      })
      const llamadas = r.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, nombre: b.name, args: b.input }] : []))
      const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n")
      return {
        texto,
        llamadas,
        fin: r.stop_reason === "tool_use" ? "herramientas" : r.stop_reason === "max_tokens" ? "limite" : r.stop_reason === "refusal" ? "rechazo" : "fin",
        tokens: r.usage.input_tokens + r.usage.output_tokens + (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0),
        crudo: r.content,
      }
    } catch (e) {
      throw new ErrorLlm(traducirError(e))
    }
  }
}

function aMensaje(t: Turno): Mensaje {
  switch (t.rol) {
    case "usuario":
      return { role: "user", content: t.texto }
    case "asistente":
      // Se reenvía el contenido original completo (incluye bloques de razonamiento) sin editarlo.
      return { role: "assistant", content: (t.crudo as Anthropic.Beta.BetaContentBlockParam[] | undefined) ?? t.texto }
    case "resultados":
      return {
        role: "user",
        content: t.resultados.map((x) => ({ type: "tool_result" as const, tool_use_id: x.id, content: x.contenido, is_error: x.error })),
      }
  }
}

function traducirError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "la clave del modelo no es válida o no está configurada"
  if (e instanceof Anthropic.RateLimitError) return "el proveedor del modelo está limitando las solicitudes; intenta de nuevo en un minuto"
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "el modelo tardó demasiado en responder (timeout)"
  if (e instanceof Anthropic.APIConnectionError) return "no hay conexión con el proveedor del modelo"
  if (e instanceof Anthropic.BadRequestError) return `solicitud rechazada por el proveedor: ${e.message}`
  if (e instanceof Anthropic.APIError) return `error del proveedor del modelo (${e.status ?? "sin código"})`
  return "error inesperado al llamar al modelo"
}
