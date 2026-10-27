# Constitución del agente de contratos

Principios no negociables. Toda decisión de spec, plan o código se valida contra ellos. Si una tarea los contradice, gana la constitución y la tarea se reescribe.

| # | Principio | Cómo se hace cumplir (no basta con el prompt) |
|---|---|---|
| P1 | **El código decide, el modelo conversa.** Extracción, clasificación, registro y alertas son deterministas. El LLM orquesta y explica. | Las herramientas son la única ruta de escritura. El modelo no tiene herramienta para editar el maestro libremente. |
| P2 | **Nunca inventar.** Un dato ausente es `null` con confianza `0`. | El extractor no tiene valores por defecto silenciosos; cada derivación se marca `derivado` con su regla. |
| P3 | **La duda se convierte en pregunta, no en dato.** Confianza < 0.8 ⇒ revisión humana. | `registrar` rechaza sin `confirmado`; el **servidor** solo acepta `confirmado=true` si la revisión quedó pendiente en un turno anterior (el modelo no puede autoconfirmarse). |
| P4 | **El maestro no se corrompe.** Cero duplicados, toda modificación con historial. | Escritura atómica (archivo temporal + rename); `historial.jsonl` append-only; el fixture es solo lectura. |
| P5 | **Todo es trazable.** Cada llamada a herramienta queda visible y registrada. | `out/log.jsonl` + panel de herramientas en el chat. |
| P6 | **Un error no tumba el lote ni la sesión.** | Las herramientas devuelven `{ ok:false, error }` y nunca lanzan; el ciclo captura fallos del proveedor LLM. |
| P7 | **Secretos fuera de todo lo visible.** | Clave solo en variable de entorno del backend; `/api/health` y los logs no la exponen. |
| P8 | **Costo acotado.** | Tope de iteraciones por turno y de tokens por sesión, configurables. |

Marco de referencia: estos principios se mapean a NIST AI RMF (Govern / Map / Measure / Manage) e ISO/IEC 42001 en `SOLUCION.md`.
