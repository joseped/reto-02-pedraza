# Spec — Agente "Registro de Contratos Vigentes"

Fuente: `specs/PRD.md` (v2.0, 2026-09-03). Principios: `specs/constitution.md`.
Cada requisito tiene un ID estable (`R-xx`) que se cita en `plan.md`, `tasks.md`, en el código, en `demo.ts` y en las pruebas. Los cambios posteriores a la primera versión están en §6.

## 1. Problema

El maestro de contratos está congelado desde el 2026-05-30 y solo llegan a administración los contratos con póliza. La analista administrativa necesita un **punto único de recepción** que registre todo contrato que llegue, sin corromper el maestro y convirtiendo la duda en revisión humana. Gerencia necesita alertas de vencimientos y pólizas.

## 2. Requisitos funcionales

### Buzón (HU-1)
- **R-01** `contratos_leer_buzon` lista los mensajes de `fixtures/reto-02/buzon/` que no están en `out/procesados.json`, con `{ id, de, asunto, fecha, adjuntos[], tiene_contrato }`.
- **R-02** `tiene_contrato` es `true` si algún adjunto se llama `contrato.*` u `otrosi.*`. Una cotización es `false`. Un adjunto de contrato cuyo texto no tiene partes ni objeto identificables se rechaza después, en la validación (RN4, R-09).

### Extracción (HU-2)
- **R-03** `contratos_extraer` devuelve el esquema de PRD §7.2 con `confianza ∈ [0,1]` y `fuente` por campo, más `es_otrosi`, `valor_indeterminado`, `amplia_garantias` y `notas[]` (de dónde salió cada dato derivado).
- **R-04** Campo ausente ⇒ `null`, confianza `0`. Nunca un valor por defecto silencioso.
- **R-05** Números: el **último separador** con 1–2 dígitos a su derecha es decimal; el resto son miles (`265.000.000` → 265000000; `120,000.00` → 120000). El valor se toma solo de la cláusula VALOR, no de las garantías.
- **R-06** Fechas: día en dígitos entre paréntesis o en número + mes en letras + año. Si solo hay plazo en meses, `fecha_fin = fecha_inicio + n meses − 1 día` con confianza 0.6. Si la firma no tiene día, `fecha_inicio` es el día 1 con confianza 0.5.
- **R-07** Identificador: sin puntos ni dígito de verificación. País por tipo y longitud (NIT → CO, RUC de 13 → EC, RUC de 11 → PE, RTN → HN, otro RUC → PA), contrastado con la ciudad del domicilio (confianza 0.6 si no coinciden).
- **R-08** Otrosí: `id_contrato` = contrato **referenciado**; solo se extraen los campos modificados; el resto queda `null` y se conserva el del maestro en la validación.

### Validación (HU-3)
- **R-09** Clasificación por reglas, en este orden:
  1. RN4 `rechazado`: sin adjunto de contrato, o sin partes ni objeto.
  2. Mismo `id_contrato` existente: si `valor`, `fecha_inicio` y `fecha_fin` coinciden ⇒ RN1 `duplicado`; si difiere algún campo o es otrosí ⇒ RN2 `actualizacion`.
  3. Mismo `nit_cliente` + similitud de `objeto` ≥ 0.9 ⇒ `actualizacion`.
  4. En otro caso ⇒ RN3 `nuevo`. Si el cliente ya tiene otros contratos con objeto distinto, se advierte.
- **R-10** `requiere_revision[]` = campos con confianza < 0.8 + conflictos de identidad con el maestro (`conflicto:nit_cliente`, `conflicto:pais`). Devuelve `detalle_revision` (valor propuesto, confianza, motivo) y `diferencias` campo a campo cuando es actualización.
- **R-11** El remitente se resuelve contra `comerciales.json`; si es desconocido se reporta en `advertencias[]` y no bloquea.
- **R-12** Un otrosí que exige ampliar garantías cambia `estado_poliza` a `pendiente`.

### Registro (HU-4)
- **R-13** `contratos_registrar` escribe solo si `requiere_revision` está vacío **o** `confirmado = true`. Si no, devuelve `{ ok:false, error:"requiere revisión: <campos>" }`.
- **R-14** Con `confirmado = true` acepta `correcciones` (valores dictados por la usuaria), validadas con zod. Quedan en el historial con `confirmado_por: "usuario"`. Los campos en revisión que la usuaria no menciona conservan el valor propuesto que se le mostró en la pregunta (ver R-27).
- **R-15** `duplicado` y `rechazado` no escriben en el maestro, pero sí marcan el mensaje como procesado.
- **R-16** Escribe o actualiza la fila en `out/sharepoint/maestro-contratos.csv` (copia del fixture en la primera ejecución) y copia el adjunto a `out/sharepoint/Contratos/<año_inicio>/<cliente-slug>/<id>.<ext>`. Un otrosí se archiva como `<id>-otrosi-<mensaje>.<ext>` sin sobrescribir el contrato. Añade `{ ts, fecha, id_contrato, accion, cambios, mensaje_id, archivo, confirmado_por, correcciones }` a `out/sharepoint/historial.jsonl` y marca `out/procesados.json`.
- **R-17** `fecha_registro` = fecha de referencia (`FECHA_HOY` en el entorno; si no existe, la fecha del sistema). `fuente = buzon`.

### Alertas (HU-5)
- **R-18** `contratos_alertas({ hoy })` genera `out/alertas.md` con estas secciones: (a) vencen en ≤ 60 días, (b) `requiere_poliza` con `estado_poliza ≠ vigente`, (c) registrados o actualizados por el buzón desde el 2026-05-30, y (d) **adicional:** vencidos que siguen en el maestro sin cierre.

### Errores (HU-6)
- **R-19** Texto vacío, fecha inválida o moneda desconocida ⇒ `{ ok:false, error }` legible. Ninguna herramienta lanza excepciones.

### Agente y API (PRD §6)
- **R-20** Ciclo del agente con tope de iteraciones (por defecto 25) y de tokens por sesión. Al alcanzar el tope, responde con lo hecho y lo pendiente.
- **R-21** Guardia de confirmación en el servidor (constitución P3).
- **R-22** `needsConfirmation` se calcula a partir de los resultados de las herramientas, no del texto del modelo. Es `true` mientras quede algún mensaje pendiente de confirmación.
- **R-23** Endpoints `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health` (sin claves), `POST /api/reset` (reinicia `out/` y las sesiones) y `GET /arquitectura`. Un turno por sesión a la vez (409 si hay otro en curso). Las páginas se sirven con `cache-control: no-store`.
- **R-24** El front muestra el historial, el indicador de "pensando", una tarjeta por cada llamada a herramienta (nombre, argumentos, resultado) y un banner cuando se pide confirmación. Además: renderiza tablas y listas anidadas, conserva la sesión al recargar, permite reiniciar los datos, escapa todo el contenido (sin XSS), explica cuando el servidor se está iniciando (502/503), se adapta a móvil y nunca recorta un mensaje largo.
- **R-25** El prompt vive en `agent/prompt.md` y el conocimiento en `src/knowledge/registro-contratos.md`; ambos se cargan al arrancar sin su frontmatter.
- **R-26** A la usuaria solo le llega el **texto final** del modelo; las notas que escribe entre llamadas a herramientas no se muestran.
- **R-27** Una confirmación acepta los valores propuestos que el agente mostró en su pregunta para los campos que la usuaria no menciona, y el agente dice explícitamente cuáles quedaron aceptados así. Si no hubo pregunta previa, primero pregunta.
- **R-28** El agente no ofrece acciones que sus herramientas no pueden hacer (constitución P9). Una inconsistencia detectada después de registrar se señala y se remite a un otrosí por el buzón o a la analista.
- **R-29** Tras registrar una confirmación, si en la conversación ya se generaron alertas, el agente las vuelve a generar con la misma fecha e informa qué cambió.
- **R-30** Si `ACCESS_KEY` está definida, `/api/*` (salvo health) exige el encabezado `x-access-key`; el front la pide y la recuerda.
- **R-31** Proveedor `simulado` (`LLM_PROVIDER=simulado`): guion determinista que llama a las herramientas reales, sin clave, para QA. Demuestra que cambiar de proveedor no toca el ciclo del agente.

### Documentación y calidad
- **R-32** Diagrama de arquitectura interactivo (`docs/arquitectura.html`): nodos con archivo, requisitos y principios, y recorridos animados (buzón, confirmación, autoconfirmación bloqueada, `demo.ts`).
- **R-33** QA en navegador con Playwright (`npm run e2e`) y evidencia reproducible en `docs/evidencia/` (`npm run evidencia`, con `--live` para una corrida con el modelo real).
- **R-34** Bonus PRD §9.4: `modulo/` con `agent.md` (frontmatter `description`, `mode: primary`, `permission { edit: deny, bash: deny }`), `tools/contratos.ts` y `skill/registro-contratos/SKILL.md` (frontmatter `name`, `description`). Son **las mismas piezas** que usa la app: `agent.md` y `SKILL.md` son enlaces simbólicos a `agent/prompt.md` y `src/knowledge/registro-contratos.md`, y `tools/contratos.ts` reexporta los mismos objetos. Las herramientas se importan sin el servidor.

## 3. Criterios de aceptación

### 3.1 Negocio (los verifica `demo.ts`, con `FECHA_HOY=2026-09-03`)

| Msg | Clasificación | requiere_revision | Acción en la 1.ª pasada | Detalle verificable |
|---|---|---|---|---|
| 001 | nuevo | — | registrado | `CT-2026-015`, NIT `890900111`, 265000000 COP, 2026-08-01→2027-07-31, póliza `cumplimiento`, `pendiente`, Laura Gómez |
| 002 | nuevo | — | registrado | `CT-2026-016`, EC, RUC `1790012345001`, **120000** USD, 2026-08-15→2027-08-14, `no_aplica`, Carlos Ruiz |
| 003 | actualizacion | — | fila actualizada | CT-2026-011: fecha_fin 2027-05-01→**2027-11-01**, valor 350000→**520000**, póliza→`pendiente`; historial con diferencias |
| 004 | duplicado | — | sin escritura | coincide con CT-2026-012 |
| 005 | rechazado | — | sin escritura | motivo: cotización, sin contrato |
| 006 | nuevo | valor, fecha_inicio, fecha_fin, requiere_poliza | **no registrado** | `CM-2026-03`, NIT `800222333` **no** se confunde con CT-2026-002; remitente desconocido en advertencias |
| 006 (2.ª llamada) | nuevo | — | registrado con `confirmado=true` y `correcciones { valor: 0, fecha_fin: 2027-08-31 }` | correcciones y `confirmado_por: usuario` en el historial |

Alertas con `hoy=2026-09-03`: (a) CT-2026-009 (2026-09-30) y CT-2026-004 (2026-10-15); (b) CT-2026-004, CT-2026-015, CT-2026-011, CM-2026-03; (c) CT-2026-015, CT-2026-016, CT-2026-011 (actualizado), CM-2026-03; (d) CT-2025-018 y CT-2026-002.

Un mensaje inexistente devuelve `{ ok:false }` sin lanzar excepción.

### 3.2 Agente y módulo (los verifican `tests/guardia.test.ts`, con un LLM simulado, y `tests/modulo.test.ts`)

| Escenario | Resultado esperado |
|---|---|
| El modelo intenta `confirmado=true` en el mismo turno en que surge la revisión | Se anula, se descartan las correcciones y no se escribe (R-21) |
| Confirmación explícita en el turno siguiente | Registra con las correcciones (R-14) |
| Mensaje que no es afirmación | No habilita la confirmación |
| Argumentos inválidos (por ejemplo, `../../etc`) | Error al modelo sin ejecutar (R-19) |
| Error del proveedor LLM | Se informa y la sesión sigue viva (P6) |
| Tope de iteraciones | Corta el turno con un mensaje claro (R-20) |
| Módulo: `agent.md` y `SKILL.md` | Resuelven a los mismos archivos que la app; frontmatter válido (R-34) |
| Módulo: `tools/contratos.ts` | Exporta los mismos objetos que la app y `leer_buzon` corre sin el servidor (R-34) |

### 3.3 Navegador (los verifica `e2e/`, con el proveedor simulado)

Flujo del PRD con 13 tarjetas sin errores, banner y registro tras confirmar; ningún mensaje recortado; la sesión sobrevive a recargar; el reinicio deja 6 mensajes pendientes; 401 sin clave de acceso; health sin secretos; sin XSS; aviso claro ante un 503; sin desborde a 390 px; diagrama con 16 nodos y 15 aristas, panel por nodo y 4 recorridos completos.

### 3.4 Modelo real (lo verifica `e2e/live.spec.ts`)

Con `claude-opus-5-5` y el prompt del PRD §11: el turno 1 termina con banner y sin errores de herramienta; el turno 2 (*"Confirmo el valor 0 y la fecha fin 2027-08-31 para msg-006"*) registra CM-2026-03 y quita el banner. La transcripción queda en `docs/evidencia/modelo-real/`.

## 4. Decisiones de interpretación (van a `SOLUCION.md` §Supuestos)

- **D1 · msg-006, fecha de firma sin día** ("en el mes de agosto de 2026"): se propone `fecha_inicio = 2026-08-01` (conf 0.5) y `fecha_fin = 2027-07-31` (derivada, conf 0.6). El PRD solo espera revisión de `valor` y `fecha_fin`; se incluye también `fecha_inicio` porque **es tan incierta como la fecha fin**. Con R-27, la confirmación del PRD (*"confirmo el valor 0 y la fecha fin 2027-08-31"*) registra en un solo paso, aceptando el inicio propuesto, y el agente advierte que esa fecha fin no cuadra con un plazo de 12 meses.
- **D2 · msg-006, póliza condicional** (solo para órdenes de más de COP 100M): se propone `requiere_poliza = true`, `cumplimiento`, `pendiente`, con conf 0.6. Es preferible una alerta de más que una obligación contractual sin seguimiento.
- **D3 · Comercial desconocido**: `comercial = "<email> (no registrado)"`. No se infiere el nombre a partir de la firma del correo.
- **D4 · Otrosí y garantías** (R-12): el texto exige ampliar las pólizas, así que la vigente deja de cubrir el nuevo plazo y pasa a `pendiente`.
- **D5 · Sección de alertas adicional (d)**: el PRD no la pide, pero responde la pregunta de gerencia sobre qué está vencido y sigue abierto.

## 5. Fuera de alcance
OCR, PDF nativo (P1 `leer_pdf`), autenticación de usuarios, base de datos y Exchange/SharePoint reales.

## 6. Historial de cambios de la spec

| Versión | Origen | Cambios |
|---|---|---|
| 1.0 | Spec inicial aprobada | R-01 a R-25, criterios §3.1, decisiones D1–D5 |
| 1.1 | Primera prueba con el modelo real (local) | R-26: se colaba una nota interna en inglés. R-27: la confirmación parcial del PRD obligaba a otra pregunta |
| 1.2 | Pruebas en el link público | R-28 y P9: el agente ofrecía corregir un contrato ya registrado. R-29: preguntaba si regenerar las alertas en vez de hacerlo. R-24: listas anidadas planas y "sin conexión" durante un redespliegue |
| 1.3 | Seguridad y QA | R-30 (clave de acceso), R-31 (proveedor simulado), R-32 (diagrama), R-33 (QA y evidencia), P10. El QA encontró dos defectos del front (desborde en móvil y mensajes recortados), incorporados a R-24 con sus pruebas de regresión |
| 1.4 | Revisión de congruencia | R-02 se alineó con la implementación: detecta contratos por el adjunto y no por el texto. R-03, R-10, R-16 y R-23 se completaron con lo que el código ya hacía |
| 1.5 | Bonus del PRD | R-34: módulo reutilizable sin copias divergentes, con sus pruebas |
