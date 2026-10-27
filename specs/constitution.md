# Constitución del agente de contratos

Principios no negociables. Toda decisión de spec, plan o código se valida contra ellos. Si una tarea los contradice, gana la constitución y la tarea se reescribe.

| # | Principio | Cómo se hace cumplir (no basta con el prompt) |
|---|---|---|
| P1 | **El código decide, el modelo conversa.** Extracción, clasificación, registro y alertas son deterministas. El LLM orquesta y explica. | Las herramientas son la única ruta de escritura. `validar` y `registrar` vuelven a extraer del documento original; el objeto que envía el modelo es solo informativo. |
| P2 | **Nunca inventar.** Un dato ausente es `null` con confianza `0`. | El extractor no tiene valores por defecto silenciosos. Cada derivación queda explicada en `fuente` y en `notas`. |
| P3 | **La duda se convierte en pregunta, no en dato.** Confianza < 0.8 ⇒ revisión humana. | `registrar` rechaza sin `confirmado`. El **servidor** solo respeta `confirmado=true` si la revisión quedó pendiente en un turno **anterior** y el mensaje actual de la usuaria es una afirmación. Si no, anula `confirmado` y descarta las `correcciones`. |
| P4 | **El maestro no se corrompe.** Cero duplicados, toda modificación con historial. | Escritura atómica (archivo temporal + rename); `historial.jsonl` append-only; el fixture es solo lectura. |
| P5 | **Todo es trazable.** Cada llamada a herramienta queda visible y registrada. | `out/log.jsonl` (también las llamadas rechazadas antes de ejecutarse) y una tarjeta por llamada en el chat, con argumentos y resultado. |
| P6 | **Un error no tumba el lote ni la sesión.** | Las herramientas devuelven `{ ok:false, error }` y nunca lanzan; el ciclo captura fallos del proveedor LLM; el front explica cuando el servidor se está iniciando. |
| P7 | **Secretos fuera de todo lo visible.** | La clave vive solo en una variable de entorno del backend; `/api/health`, los logs y la evidencia no la exponen. El link público se protege con `ACCESS_KEY`. |
| P8 | **Costo acotado.** | Tope de iteraciones por turno y de tokens por sesión, configurables. |
| P9 | **No se ofrece lo que no se puede hacer.** | El agente no promete acciones sin una herramienta que las respalde (por ejemplo, corregir un contrato ya registrado): remite al canal correcto (otrosí por el buzón o edición de la analista). |
| P10 | **Toda regla tiene una prueba automática y evidencia.** | `demo.ts` (criterios de negocio), `tests/` (ciclo y guardia), `e2e/` (navegador) y `docs/evidencia/`, que se regenera con `npm run evidencia`. Cada defecto corregido deja una prueba de regresión. |

Marco de referencia: estos principios se mapean a NIST AI RMF (Govern / Map / Measure / Manage) e ISO/IEC 42001 en `SOLUCION.md`.

> P9 y P10 se agregaron después de las pruebas en producción (ver `spec.md` §6, historial de cambios).
