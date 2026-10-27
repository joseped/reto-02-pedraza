# Spec — Agente "Registro de Contratos Vigentes"

Fuente: `specs/PRD.md` (v2.0, 2026-09-03). Principios: `specs/constitution.md`.
Cada requisito tiene un ID estable (`R-xx`) que se cita en `plan.md`, `tasks.md`, en el código y en `demo.ts`.

## 1. Problema

El maestro de contratos está congelado desde el 2026-05-30 y solo llegan a administración los contratos con póliza. La analista administrativa necesita un **punto único de recepción** que registre todo contrato que llegue, sin corromper el maestro y convirtiendo la duda en revisión humana. Gerencia necesita alertas de vencimientos y pólizas.

## 2. Requisitos funcionales

### Buzón (HU-1)
- **R-01** `contratos_leer_buzon` lista los mensajes de `fixtures/reto-02/buzon/` que no están en `out/procesados.json`, con `{ id, de, asunto, fecha, adjuntos[], tiene_contrato }`.
- **R-02** `tiene_contrato` es `true` solo si un adjunto es `contrato.*` u `otrosi.*`, **o** si el texto contiene partes + objeto identificables. Una cotización es `false`.

### Extracción (HU-2)
- **R-03** `contratos_extraer` devuelve el esquema de PRD §7.2 con `confianza ∈ [0,1]` por campo, más `es_otrosi`, `valor_indeterminado` y `notas[]` (de dónde salió cada dato derivado).
- **R-04** Campo ausente ⇒ `null`, confianza `0`. Nunca un valor por defecto silencioso.
- **R-05** Números: el **último separador** con 1–2 dígitos a su derecha es decimal; el resto son miles (`265.000.000` → 265000000; `120,000.00` → 120000).
- **R-06** Fechas: día en dígitos entre paréntesis o en número + mes en letras + año. Si solo hay plazo en meses, `fecha_fin = fecha_inicio + n meses − 1 día` y la confianza baja a 0.6.
- **R-07** Identificador: sin puntos ni dígito de verificación. País por tipo y longitud (NIT→CO, RUC 13→EC, RUC 11→PE, RTN→HN, RUC con ciudad Panamá→PA), respaldado por el domicilio.
- **R-08** Otrosí: `id_contrato` = contrato **referenciado**; solo se extraen los campos modificados; el resto queda `null` (se completa desde el maestro en la validación, no se inventa).

### Validación (HU-3)
- **R-09** Clasificación por reglas, en este orden:
  1. RN4 `rechazado`: sin contrato, o sin partes u objeto.
  2. Mismo `id_contrato` existente: si `valor`, `fecha_inicio` y `fecha_fin` coinciden ⇒ RN1 `duplicado`; si difiere algún campo o es otrosí ⇒ RN2 `actualizacion`.
  3. Mismo `nit_cliente` + similitud de `objeto` ≥ 0.9 ⇒ `actualizacion`.
  4. En otro caso ⇒ RN3 `nuevo`.
- **R-10** `requiere_revision[]` = campos con confianza < 0.8 + conflictos con el maestro. Devuelve `diferencias` campo a campo cuando es actualización.
- **R-11** El remitente se resuelve contra `comerciales.json`; si es desconocido se reporta en `advertencias[]` y no bloquea.
- **R-12** Un otrosí que menciona ampliar garantías cambia `estado_poliza` a `pendiente`.

### Registro (HU-4)
- **R-13** `contratos_registrar` escribe solo si `requiere_revision` está vacío **o** `confirmado = true`. Si no, devuelve `{ ok:false, error:"requiere revisión: <campos>" }`.
- **R-14** Con `confirmado = true` acepta `correcciones` (valores dados por la usuaria) para los campos en revisión; se validan con zod y quedan en el historial como `confirmado_por: "usuario"`.
- **R-15** `duplicado` y `rechazado` no escriben en el maestro, pero sí marcan el mensaje como procesado.
- **R-16** Escribe o actualiza la fila en `out/sharepoint/maestro-contratos.csv` (copia del fixture en la primera ejecución), copia el adjunto a `out/sharepoint/Contratos/<año_inicio>/<cliente-slug>/<id>.<ext>`, añade `{ ts, id_contrato, accion, cambios, mensaje_id }` a `out/sharepoint/historial.jsonl` y marca `out/procesados.json`.
- **R-17** `fecha_registro` = fecha de referencia (`FECHA_HOY` en el entorno; si no existe, la fecha del sistema). `fuente = buzon`.

### Alertas (HU-5)
- **R-18** `contratos_alertas({ hoy })` genera `out/alertas.md` con estas secciones: (a) vencen en ≤ 60 días, (b) `requiere_poliza` con `estado_poliza ≠ vigente`, (c) registrados desde el 2026-05-30, y (d) **adicional:** vencidos que siguen en el maestro sin cierre.

### Errores (HU-6)
- **R-19** Texto vacío, fecha inválida o moneda desconocida ⇒ `{ ok:false, error }` legible. Ninguna herramienta lanza excepciones.

### Agente y API (PRD §6)
- **R-20** Ciclo del agente con tope de iteraciones (por defecto 25) y de tokens por sesión. Al alcanzar el tope, responde con lo hecho y lo pendiente.
- **R-21** Guardia de confirmación en el servidor (constitución P3).
- **R-22** `needsConfirmation` se calcula a partir de los resultados de las herramientas, no del texto del modelo.
- **R-23** Endpoints `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health` y `POST /api/reset` (este último reinicia `out/` para la demo).
- **R-24** El front muestra el historial, el indicador de "pensando", las tarjetas de herramienta (nombre, argumentos, resumen) y un banner cuando se pide confirmación.
- **R-25** El prompt vive en `agent/prompt.md` y el conocimiento en `src/knowledge/registro-contratos.md`; ambos se cargan al arrancar.

## 3. Criterios de aceptación (los verifica `demo.ts`, con `FECHA_HOY=2026-09-03`)

| Msg | Clasificación | requiere_revision | Acción en la 1.ª pasada | Detalle verificable |
|---|---|---|---|---|
| 001 | nuevo | — | registrado | `CT-2026-015`, NIT `890900111`, 265000000 COP, 2026-08-01→2027-07-31, póliza `cumplimiento`, `pendiente`, Laura Gómez |
| 002 | nuevo | — | registrado | `CT-2026-016`, EC, RUC `1790012345001`, **120000** USD, 2026-08-15→2027-08-14, `no_aplica`, Carlos Ruiz |
| 003 | actualizacion | — | fila actualizada | CT-2026-011: fecha_fin 2027-05-01→**2027-11-01**, valor 350000→**520000**, póliza→`pendiente`; historial con diferencias |
| 004 | duplicado | — | sin escritura | coincide con CT-2026-012 |
| 005 | rechazado | — | sin escritura | motivo: cotización, sin contrato |
| 006 | nuevo | valor, fecha_inicio, fecha_fin, requiere_poliza | **no registrado** | `CM-2026-03`, NIT `800222333` **no** se confunde con CT-2026-002; remitente desconocido en advertencias |
| 006 (2.ª llamada) | nuevo | — | registrado con `confirmado=true` | valor 0, `valor_indeterminado`, correcciones en historial |

Alertas con `hoy=2026-09-03`: (a) CT-2026-009 (2026-09-30) y CT-2026-004 (2026-10-15); (b) CT-2026-004, CT-2026-015, CT-2026-011, CM-2026-03; (c) CT-2026-015, CT-2026-016, CT-2026-011 (actualizado), CM-2026-03; (d) CT-2025-018 y CT-2026-002.

## 4. Decisiones de interpretación (van a `SOLUCION.md` §Supuestos)

- **D1 · msg-006, fecha de firma sin día** ("en el mes de agosto de 2026"): se propone `fecha_inicio = 2026-08-01` (conf 0.5) y `fecha_fin = 2027-07-31` (derivada, conf 0.6). El PRD solo espera revisión de `valor` y `fecha_fin`; se incluye también `fecha_inicio` porque **es tan incierta como la fecha fin**. Si la usuaria confirma "fecha fin 2027-08-31", se registra el valor que ella dio.
- **D2 · msg-006, póliza condicional** (solo para órdenes de más de COP 100M): se propone `requiere_poliza = true`, `cumplimiento`, `pendiente`, con conf 0.6. Es preferible una alerta de más que una obligación contractual sin seguimiento.
- **D3 · Comercial desconocido**: `comercial = "<email> (no registrado)"`. No se infiere el nombre a partir de la firma del correo.
- **D4 · Otrosí y garantías** (R-12): el texto exige ampliar las pólizas, así que la vigente deja de cubrir el nuevo plazo y pasa a `pendiente`.
- **D5 · Sección de alertas adicional (d)**: el PRD no la pide, pero responde la pregunta de gerencia sobre qué está vencido y sigue abierto.

## 5. Fuera de alcance
OCR, PDF nativo (P1 `leer_pdf`), autenticación, base de datos, Exchange/SharePoint reales y el bonus `modulo/` (solo si sobra tiempo).
