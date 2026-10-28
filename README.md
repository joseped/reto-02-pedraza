# Agente de registro de contratos vigentes · Reto 02

Agente conversacional que actúa como **punto único de recepción** de contratos: lee el buzón, extrae los datos con un nivel de confianza por campo, detecta duplicados y otrosíes, registra en el maestro (SharePoint simulado), pide confirmación humana ante la duda y genera alertas de vencimiento y pólizas.

- **Link de prueba:** https://agente-contratos-rga2.onrender.com (plan gratuito: si estuvo inactivo, el primer acceso tarda alrededor de un minuto). El chat pide una **clave de acceso** que se entrega por separado a los evaluadores. El botón "Reiniciar datos" deja el buzón listo para repetir la demo.
- **Arquitectura interactiva:** https://agente-contratos-rga2.onrender.com/arquitectura ([docs/arquitectura.html](docs/arquitectura.html))
- **Evidencia de pruebas** (incluye una corrida con el modelo real): [docs/evidencia/](docs/evidencia/README.md)
- **Módulo reutilizable (bonus):** [modulo/](modulo/README.md)
- **Diseño y decisiones:** [SOLUCION.md](SOLUCION.md) · **Especificación (SDD):** [specs/](specs/)

## Requisitos
Node 20 o superior (probado con Node 22). No necesita base de datos ni Bun.

## Arranque en local (un comando)
```bash
cp .env.example .env        # y escribe tu ANTHROPIC_API_KEY
npm install && npm run dev  # http://localhost:3000
```
Sin clave, el servidor arranca igual: el chat avisa que falta la clave y `demo.ts` funciona.

## Verificación
```bash
npm run demo                  # herramientas sin modelo: criterios de aceptación de la spec (sale con código 1 si alguno falla)
npm test                      # ciclo del agente con un LLM simulado (guardia, errores, topes) y el módulo reutilizable
npm run e2e                   # QA en navegador con Playwright (usa tu Chrome; servidor con LLM_PROVIDER=simulado)
npm run evidencia             # regenera docs/evidencia/ con las tres suites y capturas
npm run evidencia -- --live   # además, el flujo del PRD con el modelo real (usa la clave de .env; unos USD 0.30)
```
`npm run e2e` levanta el servidor con el proveedor `simulado`: un guion determinista que llama a las herramientas reales, sin clave ni costo. Cubre el flujo del PRD en el navegador (banner, tarjetas de herramientas, confirmación), la sesión al recargar, el reinicio, la clave de acceso, el escape de HTML (XSS), el error de arranque del servidor, la vista móvil y el diagrama de arquitectura. Reporte HTML en `out/e2e-report/`.
`demo.ts` limpia `out/` al inicio y usa `FECHA_HOY=2026-09-03`, así que es determinista.

## Variables de entorno
| Variable | Obligatoria | Por defecto | Uso |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Para el chat | — | Clave del modelo. Solo vive en el backend |
| `LLM_PROVIDER` | No | `anthropic` | `simulado` = guion determinista sin clave (QA) |
| `LLM_MODEL` | No | `claude-opus-5-5` | Modelo (por ejemplo, `claude-sonnet-5-5` para bajar costo) |
| `LLM_TIMEOUT_MS` | No | `90000` | Timeout por llamada al modelo |
| `MAX_ITERACIONES` | No | `25` | Tope de pasos herramienta → modelo por turno |
| `MAX_TOKENS_SESION` | No | `400000` | Presupuesto de tokens por sesión |
| `FECHA_HOY` | No | fecha del sistema | Fecha de referencia para `fecha_registro` |
| `ACCESS_KEY` | No | — | Si se define, el front la pide para usar el chat |
| `PORT` | No | `3000` | Puerto HTTP |

## API
| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message }` → `{ reply, toolCalls[], needsConfirmation, error? }` |
| `GET` | `/api/sessions/:id` | Historial visible, turno, tokens usados y mensajes pendientes de confirmación |
| `GET` | `/api/health` | `{ ok, provider, model, llm_configurado, protegido }` (sin claves) |
| `POST` | `/api/reset` | Borra `out/` y las sesiones para repetir la demo |
| `GET` | `/arquitectura` | Diagrama de arquitectura interactivo |

Si `ACCESS_KEY` está definida, `/api/*` (salvo health) exige el encabezado `x-access-key`.

## Estructura
```
agent/prompt.md                       comportamiento (system prompt)
src/knowledge/registro-contratos.md   conocimiento del proceso
src/tools/contratos.ts                herramientas (contratos_*) · registry.ts las expone al modelo
src/core/                             lógica determinista: extractor, clasificador, maestro, alertas
src/llm/                              adaptador del proveedor (interfaz + Anthropic + simulado)
src/agent/                            ciclo del agente y sesiones
src/server.ts                         API + front estático
web/index.html                        chat
src/llm/simulado.ts                   proveedor simulado para QA (LLM_PROVIDER=simulado)
modulo/                               bonus: agente empaquetado (mismas piezas que la app, ver modulo/README.md)
demo.ts · tests/ · e2e/               verificación: herramientas, ciclo del agente, navegador
scripts/evidencia.sh                  genera docs/evidencia/
docs/arquitectura.html                diagrama interactivo (también en /arquitectura)
docs/evidencia/                       evidencia de pruebas, incluida una corrida con el modelo real
specs/                                constitución, spec, plan y tareas (SDD)
```
