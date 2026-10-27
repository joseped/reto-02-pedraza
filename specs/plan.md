# Plan técnico

Implementa `spec.md` respetando `constitution.md`. Los nombres de funciones y archivos de este documento corresponden al código.

## Stack

| Pieza | Elección | Justificación | Alternativa descartada |
|---|---|---|---|
| Runtime | Node 22 + `tsx` | El PRD permite Node 20+. Está instalado y no añade herramientas | Bun: no hay ganancia relevante y suma una dependencia en el deploy |
| HTTP | `hono` + `@hono/node-server` | Pequeño, tipado y sirve la API y las páginas | Express: más código repetitivo y tipos débiles |
| Validación | `zod` v4 | Obligatorio. `z.toJSONSchema` genera el esquema de cada herramienta para el LLM | — |
| LLM | `@anthropic-ai/sdk`, `claude-opus-5-5` (`LLM_MODEL`), `effort: medium`, caché del prompt de sistema y fallback del lado del servidor ante rechazos | Fiabilidad en uso de herramientas. Queda detrás de `LlmAdapter` | LangChain o Vercel AI SDK: ocultan el ciclo, que es justo lo que se evalúa |
| Proveedor de QA | `SimuladoAdapter` (`LLM_PROVIDER=simulado`) | QA en navegador gratis, sin clave y determinista; demuestra el cambio de proveedor | Llamar al modelo real en cada corrida: lento, con costo y no determinista |
| Front | `web/index.html` + JS plano | Sin compilación ni CORS y con menos piezas que se puedan romper | React: demasiado para una sola pantalla |
| Pruebas | `node:test` (ciclo), `@playwright/test` con el Chrome instalado (navegador) | Sin descargar navegadores ni frameworks extra | Playwright MCP: no estaba cargado en la sesión de desarrollo y no deja pruebas reproducibles en el repo |
| Deploy | Docker → Render (`render.yaml`), link protegido con `ACCESS_KEY` | Servidor con estado y disco para `out/` | Vercel: es serverless y la sesión y `out/` no sobreviven entre peticiones |

## Módulos

```
src/core/            lógica pura, sin E/S de red, testeable
  reglas.ts          REGLAS (umbrales, días de alerta, corte, NIT propio), CIUDADES, TIPOS_POLIZA
  numeros.ts         parseMonto()                                                     [R-05]
  fechas.ts          fechasEnTexto(), fechaFirma(), plazoMeses(), finDePlazo(), hoyReferencia()  [R-06, R-17]
  texto.ts           normalizar(), slug(), similitud() (Dice sobre tokens), parrafos(), recortar()
  schema.ts          esquemas zod: Fila, Correcciones, Correo, Comercial; tipos Campo, ContratoExtraido
  extractor.ts       extraerContrato(texto, correo) → ContratoExtraido                 [R-03..R-08, R-12, P2]
  clasificador.ts    clasificar(contrato, filas, comerciales, correo, hoy) → Validacion [R-09..R-12]
  maestro.ts         leerMaestro(), guardarFila() (escritura atómica), siguienteAutoId() [R-16, P4]
  store.ts           rutas(), agregarLinea(), marcarProcesado(), limpiarOut(), idSeguro()  [R-16, P5]
  alertas.ts         calcularAlertas(filas, historial, hoy), alertasMarkdown()          [R-18]
src/tools/contratos.ts   5 herramientas {description,args,execute}; envoltorio ejecutar() (nunca lanza, registra en log);
                         evaluar() reextrae del documento; registrarMensaje()          [R-01..R-19]
src/tools/registry.ts    HERRAMIENTAS: cada export → `contratos_<export>` + JSON Schema
src/llm/adapter.ts       interface LlmAdapter { enviar(system, turnos, herramientas) }; tipos neutrales Turno
src/llm/anthropic.ts     AnthropicAdapter: timeout, caché, fallback, errores tipados → lenguaje claro
src/llm/simulado.ts      SimuladoAdapter: guion determinista sobre las herramientas reales [R-31]
src/agent/loop.ts        procesarMensaje(): ciclo, topes, aplicarGuardia(), actualizarPendientes(),
                         needsConfirmation, solo texto final, topes de costo          [R-20..R-22, R-26, P8]
src/agent/sessions.ts    sesiones en memoria + respaldo en out/sessions/*.json
src/server.ts            API, clave de acceso, un turno por sesión, /, /arquitectura   [R-23, R-30, P7]
web/index.html           chat                                                          [R-24]
agent/prompt.md          comportamiento                                                [R-25..R-29]
src/knowledge/registro-contratos.md   reglas de negocio                                [R-25]
docs/arquitectura.html   diagrama interactivo                                          [R-32]
demo.ts                  criterios de spec §3.1
tests/guardia.test.ts    criterios de spec §3.2 (directorio temporal, nunca toca out/ real)
e2e/                     criterios de spec §3.3 y §3.4; evidencia.ts (capturas)        [R-33]
scripts/evidencia.sh     regenera docs/evidencia/                                      [R-33]
```

## Contratos internos clave

```ts
type Campo<T> = { valor: T | null; confianza: number; fuente: string }
type ContratoExtraido = {
  id_contrato: Campo<string>; cliente: Campo<string>; nit_cliente: Campo<string>; pais: Campo<Pais>
  objeto: Campo<string>; valor: Campo<number>; moneda: Campo<Moneda>
  fecha_inicio: Campo<string>; fecha_fin: Campo<string>
  requiere_poliza: Campo<boolean>; tipo_poliza: Campo<string>
  es_otrosi: boolean; valor_indeterminado: boolean; amplia_garantias: boolean; notas: string[]
}
```
El modelo puede reenviar este objeto, pero **`validar` y `registrar` vuelven a extraer del documento** (`evaluar()`) y solo aplican `correcciones` explícitas. Aunque el modelo altere el JSON, no puede cambiar valores (constitución P1).

## Guardia de confirmación (R-21)
1. `actualizarPendientes()` registra `pendientes[mensaje_id] = turno` cuando `validar` devuelve campos en revisión o `registrar` responde "requiere revisión". Lo borra cuando `registrar` tiene éxito.
2. `aplicarGuardia()`: si el modelo llama `registrar` con `confirmado=true`, el servidor lo respeta solo si `pendientes[mensaje_id] < turno actual` **y** el mensaje de la usuaria es una afirmación (*confirmo, sí, adelante, apruebo…*). Si no, **ejecuta con `confirmado=false` y sin `correcciones`**, así que la herramienta responde "requiere revisión" y no escribe nada.
3. La herramienta conserva su propia regla (R-13). `demo.ts` la llama directamente, como si fuera la usuaria.
4. `needsConfirmation` = existe algún pendiente al cerrar el turno (R-22).

## Respuesta al usuario (R-26)
El texto que el modelo escribe entre llamadas a herramientas se guarda como nota intermedia. A la usuaria solo le llega el texto de la respuesta final. Si el turno se corta por el tope, se muestran las notas más el aviso del tope.

## Riesgos del plan
| Riesgo | Mitigación |
|---|---|
| Parser frágil ante variantes de texto | Pruebas sobre los 6 fixtures en `demo.ts` + confianza baja cuando la regex no encuentra el dato |
| El deploy falla al final | Deploy temprano; desde entonces cada push redespliega |
| El modelo se salta pasos | El prompt define la secuencia y el servidor tiene la guardia; los valores salen de las herramientas |
| Las pruebas borran el estado real | `tests/` usa un directorio temporal con enlace a los fixtures |
| Un redespliegue en plena demo | Aviso claro ante 502/503 en el front; no hacer push el día de la defensa |
| Un defecto visual que no detecta `demo.ts` | E2E en el navegador y revisión de las capturas de evidencia |
