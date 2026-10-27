# Evidencia de pruebas

Generada con `npm run evidencia -- --live` ([scripts/evidencia.sh](../../scripts/evidencia.sh)). Se puede regenerar en cualquier momento. Sin `--live` no necesita clave ni tiene costo.

| | |
|---|---|
| Fecha | 2026-10-27 18:41 (-05) |
| Código | commit `c28f269` más los cambios del commit que agrega esta carpeta (corrección de mensajes aplastados en el chat) |
| Entorno | Node v22.14.0 · macOS (Darwin 25.6.0) · Google Chrome 156 · Playwright 1.64.1 |
| Fecha de referencia del negocio | `FECHA_HOY=2026-09-03` (la del PRD) |

## Resumen

| Suite | Qué prueba | Resultado | Salida |
|---|---|---|---|
| `demo.ts` | Herramientas sin modelo contra los criterios de aceptación de [spec §3](../../specs/spec.md) | **26 ✓ · 0 ✗** | [demo.txt](salidas/demo.txt) |
| `npm test` | Ciclo del agente con LLM simulado: guardia de confirmación, argumentos maliciosos, error del proveedor, tope de iteraciones | **6 / 6** | [tests-guardia.txt](salidas/tests-guardia.txt) |
| `npm run e2e` | Navegador (Playwright + Chrome): flujo PRD, sesión, reinicio, clave de acceso, XSS, error de arranque, móvil y diagrama | **13 / 13** | [e2e.txt](salidas/e2e.txt) |
| E2E con **modelo real** | Flujo PRD §11 de punta a punta con `claude-opus-5-5` | **1 / 1** · 78.754 tokens | [e2e-modelo-real.txt](salidas/e2e-modelo-real.txt) |

## Corrida con el modelo real (`modelo-real/`)

El prompt del PRD en dos turnos: procesar el buzón y luego *"Confirmo el valor 0 y la fecha fin 2027-08-31 para msg-006"*.

| Archivo | Contenido |
|---|---|
| [transcripcion.md](modelo-real/transcripcion.md) | Conversación completa, con cada llamada a herramienta, sus argumentos y su resultado |
| [01-turno1-procesar-buzon.png](modelo-real/01-turno1-procesar-buzon.png) | 13 herramientas, tabla por mensaje, revisión campo por campo de msg-006, alertas y pregunta final. Mensaje resaltado con el banner de confirmación |
| [02-turno2-confirmacion.png](modelo-real/02-turno2-confirmacion.png) | Registro de CM-2026-03 con el origen de cada valor, advertencia de fechas y alertas regeneradas |
| [maestro-contratos.csv](modelo-real/maestro-contratos.csv) | Maestro resultante: CT-2026-015 y CT-2026-016 nuevos, CT-2026-011 actualizado y CM-2026-03 confirmado |
| [historial.jsonl](modelo-real/historial.jsonl) | Cambios append-only. CM-2026-03 queda con `confirmado_por: "usuario"` y sus correcciones |
| [alertas.md](modelo-real/alertas.md) | Reporte para gerencia en sus 4 secciones |
| [log.jsonl](modelo-real/log.jsonl) | Las 15 llamadas a herramientas registradas (CA4) |
| [sesion.json](modelo-real/sesion.json) | La sesión tal como la devuelve `GET /api/sessions/:id` |

## Capturas del QA (`capturas/`)

| Captura | Qué demuestra |
|---|---|
| [01](capturas/01-turno1-buzon-procesado-y-revision.png) | Turno 1: banner de confirmación y 13 herramientas sin errores |
| [02](capturas/02-tarjeta-herramienta-validar-msg006.png) | La tarjeta expandida de `contratos_validar` muestra argumentos y confianza: los valores salen de las herramientas |
| [03](capturas/03-turno2-confirmacion-registrada.png) | Turno 2: registro de CM-2026-03 y regeneración de alertas |
| [04](capturas/04-xss-escapado.png) | El HTML malicioso del usuario se muestra como texto y no se ejecuta |
| [05](capturas/05-aviso-servidor-iniciando.png) | Ante un 503 del proveedor de hosting, el chat explica que el servidor se está iniciando |
| [06](capturas/06-movil-390px.png) | Vista móvil a 390 px sin desborde |
| [07](capturas/07-arquitectura-vista-general.png) | Diagrama de arquitectura |
| [08](capturas/08-arquitectura-autoconfirmacion-bloqueada.png) | Recorrido ③: la guardia bloquea la autoconfirmación |

## Defectos que encontró el QA y su corrección

| # | Defecto | Cómo se detectó | Corrección | Prueba de regresión |
|---|---|---|---|---|
| 1 | En móvil (390 px) la cabecera desbordaba y ocultaba "Reiniciar datos" | E2E "móvil": desborde de 94 px | Cabecera adaptable | `e2e/chat.spec.ts` · móvil |
| 2 | En conversaciones largas los mensajes se aplastaban con scroll interno: la respuesta del agente se veía cortada | Al revisar estas capturas | `flex-shrink: 0` en los mensajes | `e2e/chat.spec.ts` · flujo PRD. Sin la corrección falla con 4 mensajes aplastados; con ella pasa |
| 3 | Durante un redespliegue el chat decía "sin conexión" | Prueba manual en producción | Mensaje específico para 502/503 y `no-store` en la página | `e2e/chat.spec.ts` · 503 |
| 4 | El agente ofrecía corregir un contrato ya registrado, sin tener herramienta para eso | Revisión de la transcripción en producción | Regla 6 del prompt | Verificado en la transcripción de esta carpeta |

Se revisó que en esta carpeta no haya claves ni secretos.
