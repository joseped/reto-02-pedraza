# Tareas

Cada tarea cita los requisitos que cubre. Se marca `[x]` al terminar y se hace commit por bloque.

## Bloque 1 · Esqueleto y deploy temprano
- [x] T01 `package.json`, `tsconfig.json` (strict, sin `any`), `.gitignore`, `.env.example`
- [x] T02 `src/server.ts` con `/api/health` + `web/index.html` como placeholder
- [ ] T03 `Dockerfile` + deploy de prueba (requiere la cuenta del usuario)

## Bloque 2 · Núcleo de extracción
- [x] T04 `core/numeros.ts`, `core/fechas.ts`, `core/texto.ts` — R-05, R-06
- [x] T05 `core/schema.ts` — esquemas zod
- [x] T06 `core/extractor.ts` — R-03, R-04, R-07, R-08, R-12
- [x] T07 Verificación de la extracción sobre los 6 mensajes contra spec §3

## Bloque 3 · Herramientas y demo
- [x] T08 `core/maestro.ts`, `core/store.ts` — R-16, P4, P5
- [x] T09 `core/clasificador.ts` — R-09, R-10, R-11
- [x] T10 `core/alertas.ts` — R-18
- [x] T11 `tools/contratos.ts` + `tools/registry.ts` — R-01, R-02, R-13..R-15, R-17, R-19
- [x] T12 `demo.ts` — spec §3 completa, incluida la 2.ª llamada a msg-006

## Bloque 4 · Agente
- [x] T13 `llm/adapter.ts`, `llm/anthropic.ts` (timeout)
- [x] T14 `agent/sessions.ts`, `agent/loop.ts` — R-20, R-21, R-22
- [x] T15 `agent/prompt.md`, `knowledge/registro-contratos.md` — R-25
- [x] T16 Rutas `/api/chat`, `/api/sessions/:id`, `/api/reset` — R-23

## Bloque 5 · Front
- [x] T17 Chat: historial, indicador de "pensando", tarjetas de herramientas, banner de confirmación, botón de reinicio — R-24

## Bloque 6 · Deploy final
- [ ] T18 Redeploy + prueba con el prompt del PRD §11

## Bloque 7 · Documentación
- [ ] T19 `README.md`
- [ ] T20 `SOLUCION.md`: 11 secciones + regla de gobierno + mapa NIST AI RMF / ISO 42001 + trazabilidad de requisitos a código
