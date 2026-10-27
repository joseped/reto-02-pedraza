# Plan técnico

Implementa `spec.md` respetando `constitution.md`.

## Stack

| Pieza | Elección | Justificación | Alternativa descartada |
|---|---|---|---|
| Runtime | Node 22 + `tsx` | El PRD permite Node 20+. Está instalado y no añade herramientas | Bun: no hay ganancia relevante y suma una dependencia en el deploy |
| HTTP | `hono` + `@hono/node-server` | Pequeño, tipado y sirve la API y los estáticos | Express: más código repetitivo y tipos débiles |
| Validación | `zod` v4 | Obligatorio. `z.toJSONSchema` genera el esquema de cada herramienta para el LLM | — |
| LLM | `@anthropic-ai/sdk`, modelo configurable (`LLM_MODEL`) | Buen uso de herramientas. Queda detrás de `LlmAdapter` | LangChain o Vercel AI SDK: ocultan el ciclo, que es justo lo que se evalúa |
| Front | `web/index.html` + JS plano | Sin compilación ni CORS y con menos piezas que se puedan romper | React: demasiado para una sola pantalla |
| Deploy | Docker → Render (o Railway) | Servidor con estado y disco para `out/` | Vercel: es serverless y la sesión y `out/` no sobreviven entre peticiones (ver `SOLUCION.md`) |

## Módulos

```
src/core/            lógica pura, sin E/S de red, testeable
  numeros.ts         parseMonto(), palabras de meses
  fechas.ts          parseFechaEs(), sumarMeses()
  texto.ts           normalizar(), slug(), similitud()   (Dice sobre tokens)
  extractor.ts       extraerContrato(texto, correo) → Contrato + confianza   [R-03..R-08]
  clasificador.ts    clasificar(contrato, maestro) → Validacion               [R-09..R-12]
  maestro.ts         leer/escribir CSV (escritura atómica)                    [R-16, P4]
  store.ts           rutas out/, log.jsonl, historial, procesados             [R-16, P5]
  alertas.ts         calcularAlertas(maestro, historial, hoy) → md            [R-18]
  schema.ts          esquemas zod Contrato, Fila, Validacion
src/tools/contratos.ts   5 herramientas {description,args,execute}, envoltorio safe() [R-01..R-19]
src/tools/registry.ts    carga dinámica de exports → nombre `<archivo>_<export>`
src/llm/adapter.ts       interface LlmAdapter { enviar(mensajes, herramientas) }
src/llm/anthropic.ts     implementación, timeout, mapeo de errores
src/agent/loop.ts        ciclo, topes, guardia de confirmación, needsConfirmation [R-20..R-22]
src/agent/sessions.ts    sesiones en memoria + respaldo en out/sessions/*.json
src/server.ts            rutas API + estáticos                                    [R-23]
web/index.html           chat                                                     [R-24]
agent/prompt.md          comportamiento                                           [R-25]
src/knowledge/registro-contratos.md   reglas de negocio                           [R-25]
demo.ts                  criterios de aceptación de spec §3
```

## Contratos internos clave

```ts
type Campo<T> = { valor: T | null; confianza: number; fuente?: string }
type ContratoExtraido = {
  id_contrato: Campo<string>; cliente: Campo<string>; nit_cliente: Campo<string>; pais: Campo<Pais>
  objeto: Campo<string>; valor: Campo<number>; moneda: Campo<Moneda>
  fecha_inicio: Campo<string>; fecha_fin: Campo<string>
  requiere_poliza: Campo<boolean>; tipo_poliza: Campo<string>
  es_otrosi: boolean; valor_indeterminado: boolean; amplia_garantias: boolean; notas: string[]
}
```
El modelo recibe y reenvía este objeto. **`validar` y `registrar` vuelven a extraer desde el archivo** y solo aplican `correcciones` explícitas. Así, aunque el modelo altere el JSON que pasa, no puede cambiar valores (constitución P1).

## Guardia de confirmación (R-21)
1. `registrar` sin confirmación devuelve `requiere revisión` → el ciclo guarda `pendientes[mensaje_id] = turno`.
2. Si en un turno posterior el modelo llama `registrar` con `confirmado=true`, el ciclo verifica que `pendientes[mensaje_id] < turnoActual`. Si no, devuelve un error al modelo **sin ejecutar** la herramienta.
3. La herramienta conserva su propia regla (R-13). `demo.ts` la llama directamente, como si fuera la usuaria.

## Riesgos del plan
| Riesgo | Mitigación |
|---|---|
| Parser frágil ante variantes de texto | Pruebas sobre los 6 fixtures en `demo.ts` + confianza baja cuando la regex no encuentra dato |
| El deploy falla al final | Deploy de un "hola mundo" en el bloque 1 |
| El modelo se salta pasos | El prompt define la secuencia y el servidor tiene la guardia; los valores salen de las herramientas |
