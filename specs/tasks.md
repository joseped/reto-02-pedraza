# Tareas

Cada tarea cita los requisitos que cubre. Se marca `[x]` al terminar y se hace commit por bloque. Los bloques 8 a 11 se agregaron después de la primera entrega, a partir de las pruebas con el modelo real, en producción y del QA (ver `spec.md` §6).

## Bloque 1 · Esqueleto y deploy temprano
- [x] T01 `package.json`, `tsconfig.json` (strict, sin `any`), `.gitignore`, `.env.example`
- [x] T02 `src/server.ts` con `/api/health` + `web/index.html` como placeholder
- [x] T03 `Dockerfile` + `render.yaml` + deploy en Render

## Bloque 2 · Núcleo de extracción
- [x] T04 `core/numeros.ts`, `core/fechas.ts`, `core/texto.ts`, `core/reglas.ts` — R-05, R-06
- [x] T05 `core/schema.ts` — esquemas zod
- [x] T06 `core/extractor.ts` — R-03, R-04, R-07, R-08, R-12
- [x] T07 Verificación de la extracción sobre los 6 mensajes contra spec §3.1

## Bloque 3 · Herramientas y demo
- [x] T08 `core/maestro.ts`, `core/store.ts` — R-16, P4, P5
- [x] T09 `core/clasificador.ts` — R-09, R-10, R-11
- [x] T10 `core/alertas.ts` — R-18
- [x] T11 `tools/contratos.ts` + `tools/registry.ts` — R-01, R-02, R-13..R-15, R-17, R-19
- [x] T12 `demo.ts` — spec §3.1 completa, incluida la 2.ª llamada a msg-006

## Bloque 4 · Agente
- [x] T13 `llm/adapter.ts`, `llm/anthropic.ts` (timeout, caché, fallback)
- [x] T14 `agent/sessions.ts`, `agent/loop.ts` — R-20, R-21, R-22
- [x] T15 `agent/prompt.md`, `knowledge/registro-contratos.md` — R-25
- [x] T16 Rutas `/api/chat`, `/api/sessions/:id`, `/api/reset` — R-23
- [x] T16b `tests/guardia.test.ts` — spec §3.2

## Bloque 5 · Front
- [x] T17 Chat: historial, indicador de "pensando", tarjetas de herramientas, banner de confirmación, botón de reinicio — R-24

## Bloque 6 · Deploy final
- [x] T18 Redeploy + prueba con el prompt del PRD §11

## Bloque 7 · Documentación
- [x] T19 `README.md`
- [x] T20 `SOLUCION.md`: 11 secciones + regla de gobierno + mapa NIST AI RMF / ISO 42001 + trazabilidad de requisitos a código

## Bloque 8 · Ajustes tras la prueba con el modelo real
- [x] T21 Mover la clave de `.env.example` a `.env` (ignorado por git) y verificar que no quedó en ningún commit — P7
- [x] T22 Mostrar solo el texto final del modelo — R-26
- [x] T23 Aislar `tests/` en un directorio temporal (borraban el `out/` real)
- [x] T24 Confirmación parcial que acepta lo propuesto, en el prompt — R-27

## Bloque 9 · Ajustes tras las pruebas en producción
- [x] T25 Regla para no ofrecer lo que no se puede hacer — R-28, P9
- [x] T26 Regenerar las alertas tras confirmar — R-29
- [x] T27 Listas anidadas en el chat — R-24
- [x] T28 Aviso claro ante 502/503 y `no-store` en las páginas — R-23, R-24

## Bloque 10 · Arquitectura y QA
- [x] T29 `docs/arquitectura.html` + ruta `/arquitectura` + enlaces — R-32
- [x] T30 Proveedor `simulado` — R-31
- [x] T31 Playwright: 13 escenarios en `e2e/` — R-33, spec §3.3
- [x] T32 Corregir el desborde en móvil detectado por el QA, con su prueba — R-24

## Bloque 11 · Evidencia y congruencia
- [x] T33 `scripts/evidencia.sh` + `e2e/live.spec.ts` + `docs/evidencia/` — R-33, spec §3.4, P10
- [x] T34 Corregir los mensajes recortados detectados en las capturas, con prueba de regresión — R-24
- [x] T35 Actualizar constitución, spec, plan, tareas, SOLUCION.md y README con todo lo anterior

## Bloque 12 · Bonus
- [x] T36 `modulo/`: frontmatter `mode` y `permission` en `agent/prompt.md`, enlaces simbólicos, reexportación de herramientas y `modulo/README.md` — R-34
- [x] T37 `tests/modulo.test.ts`: mismas piezas, frontmatter válido y ejecución sin servidor — R-34
