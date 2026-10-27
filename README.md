# Agente de registro de contratos vigentes · Reto 02

Agente conversacional que actúa como **punto único de recepción** de contratos: lee el buzón, extrae los datos con un nivel de confianza por campo, detecta duplicados y otrosíes, registra en el maestro (SharePoint simulado), pide confirmación humana ante la duda y genera alertas de vencimiento y pólizas.

- **Link de prueba:** https://agente-contratos-rga2.onrender.com (plan gratuito: si estuvo inactivo, el primer acceso tarda alrededor de un minuto). El chat pide una **clave de acceso** que se entrega por separado a los evaluadores. El botón "Reiniciar datos" deja el buzón listo para repetir la demo.
- **Diseño y decisiones:** [SOLUCION.md](SOLUCION.md) · **Especificación (SDD):** [specs/](specs/)

## Requisitos
Node 20 o superior (probado con Node 22). No necesita base de datos ni Bun.

## Arranque en local (un comando)
```bash
cp .env.example .env        # y escribe tu ANTHROPIC_API_KEY
npm install && npm run dev  # http://localhost:3000
```
Sin clave, el servidor arranca igual: el chat avisa que falta la clave y `demo.ts` funciona.

## Verificación sin modelo
```bash
npm run demo   # procesa los 6 mensajes y verifica los criterios de aceptación (sale con código 1 si alguno falla)
npm test       # ciclo del agente con un LLM simulado: guardia de confirmación, errores, topes
```
`demo.ts` limpia `out/` al inicio y usa `FECHA_HOY=2026-09-03`, así que es determinista.

## Variables de entorno
| Variable | Obligatoria | Por defecto | Uso |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Para el chat | — | Clave del modelo. Solo vive en el backend |
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

Si `ACCESS_KEY` está definida, `/api/*` (salvo health) exige el encabezado `x-access-key`.

## Despliegue (Render)
1. Sube el repositorio a GitHub.
2. En Render: **New → Blueprint** y selecciona el repositorio (usa `render.yaml` y el `Dockerfile`).
3. En el panel, define `ANTHROPIC_API_KEY` (y `ACCESS_KEY` si quieres proteger el link).

## Estructura
```
agent/prompt.md                       comportamiento (system prompt)
src/knowledge/registro-contratos.md   conocimiento del proceso
src/tools/contratos.ts                herramientas (contratos_*) · registry.ts las expone al modelo
src/core/                             lógica determinista: extractor, clasificador, maestro, alertas
src/llm/                              adaptador del proveedor (interfaz + Anthropic)
src/agent/                            ciclo del agente y sesiones
src/server.ts                         API + front estático
web/index.html                        chat
demo.ts · tests/                      verificación sin modelo
specs/                                constitución, spec, plan y tareas (SDD)
```
