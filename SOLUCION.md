# SOLUCIÓN · Agente de registro de contratos vigentes

> Reto técnico 02 · Periferia IT Group · José Aristides Pedraza González
> La solución se construyó con **Spec-Driven Development**: [`specs/constitution.md`](specs/constitution.md) → [`spec.md`](specs/spec.md) → [`plan.md`](specs/plan.md) → [`tasks.md`](specs/tasks.md). Cada requisito (`R-xx`) es trazable hasta el código y hasta `demo.ts`.

---

## 1. Problema en una frase

**Periferia no sabe qué contratos tiene vigentes**: el maestro está congelado desde el 30 de mayo de 2026 y solo llegan los contratos con póliza. Esto le duele a la **analista administrativa**, que es dueña de un maestro que no puede mantener; a **gerencia**, que no puede responder qué vence este trimestre; y a la **compañía**, expuesta a pólizas contractuales que nadie constituye ni renueva.

## 2. Arquitectura

```
┌───────────────────────┐  POST /api/chat   ┌──────────────────────────────────────────────┐
│ web/index.html        │ ────────────────▶ │ src/server.ts (Hono)                         │
│ · historial           │ ◀──────────────── │  └ src/agent/loop.ts   ciclo + topes +       │
│ · tarjetas de tools   │  reply, toolCalls,│                        GUARDIA de confirmación│
│ · banner "confirmar"  │  needsConfirmation│  └ src/llm/adapter.ts  interfaz LlmAdapter    │
└───────────────────────┘                   │      └ anthropic.ts    implementación         │
                                            │  └ src/tools/registry.ts  zod → JSON Schema    │
                                            │      └ contratos.ts    5 herramientas          │
                                            │          └ src/core/   lógica determinista     │
                                            └──────────────┬───────────────────┬────────────┘
                                                           │                   │
                                          fixtures/ (solo lectura)     out/ (escritura)
                                          buzón, maestro, comerciales  sharepoint/maestro-contratos.csv
                                                                       sharepoint/Contratos/<año>/<cliente>/
                                                                       sharepoint/historial.jsonl
                                                                       procesados.json · alertas.md · log.jsonl
```

| Capa | Dónde | Qué contiene |
|---|---|---|
| **Comportamiento** | `agent/prompt.md` | Reglas de conducta, flujo y formato de respuesta |
| **Conocimiento** | `src/knowledge/registro-contratos.md` | RN1–RN7, significado de cada campo y estado |
| **Ejecución** | `src/tools/` + `src/core/` | Extracción, clasificación, registro y alertas. Los parámetros de negocio están en `src/core/reglas.ts` |

Cambiar una regla de negocio (umbral de confianza, días de alerta, fecha de corte) toca `reglas.ts` y el conocimiento, **nunca el servidor**.

## 3. Ciclo del agente

`procesarMensaje()` en `src/agent/loop.ts`:

1. Añade el mensaje de la usuaria al historial e incrementa el turno.
2. Repite: envía al modelo el *system prompt* (prompt + conocimiento), el historial y las herramientas. Para cada `tool_use`: valida los argumentos con zod (si fallan, el error vuelve al modelo sin ejecutar nada), aplica la **guardia**, ejecuta, registra en `out/log.jsonl` y devuelve el resultado.
3. Se detiene cuando el modelo responde sin herramientas, al llegar al **tope de iteraciones** (25, configurable; responde con lo hecho y lo pendiente), cuando se agota el **presupuesto de tokens de la sesión** o ante un **error del proveedor**, que se traduce a lenguaje claro sin cerrar la sesión.

**Confirmación humana en tres capas.** El prompt prohíbe autoconfirmar, pero no confío solo en él:

| Capa | Mecanismo |
|---|---|
| Herramienta | `contratos_registrar` rechaza la escritura si hay `requiere_revision` y no viene `confirmado: true` (R-13) |
| **Servidor** | `confirmado: true` se respeta solo si la revisión de ese mensaje quedó pendiente en un **turno anterior** y el mensaje actual de la usuaria es una afirmación. Si no, el servidor anula `confirmado` y descarta las `correcciones` antes de ejecutar (R-21) |
| Front | `needsConfirmation` se calcula a partir de los **resultados de las herramientas**, no del texto del modelo. El chat resalta el mensaje con un banner (R-22) |

`tests/guardia.test.ts` lo demuestra con un LLM simulado que intenta autoconfirmarse: la escritura se bloquea.

## 4. Elección del modelo

| | |
|---|---|
| Proveedor | Anthropic (SDK oficial `@anthropic-ai/sdk`), detrás de `LlmAdapter` |
| Modelo | `claude-opus-5-5`, configurable con `LLM_MODEL` |
| Por qué | El trabajo del modelo es **orquestar y explicar**, no extraer. Necesito fiabilidad para seguir el flujo, no llamar `registrar` antes de tiempo y redactar preguntas de confirmación precisas. Opus 5.5 ofrece la mejor fiabilidad en uso de herramientas a un precio de $4 / $20 por millón de tokens (entrada / salida) |
| Configuración | `effort: medium`, prompt de sistema con caché (`cache_control`) y **fallback del lado del servidor** ante rechazos (`fallbacks: "default"`), para que un falso positivo del filtro de seguridad no rompa la demo |

**Costo estimado** (estimación a validar con el contador `tokens` de cada sesión, no una medición): procesar el buzón completo implica unas 10 a 14 llamadas al modelo, con unos 8 a 15 mil tokens de entrada cada una (prompt, herramientas e historial, la mayoría desde caché) y unos 2 a 4 mil de salida en total.

| Escenario | Por buzón (6 mensajes) | Por contrato |
|---|---|---|
| Opus 5.5 con caché | ≈ USD 0.25 – 0.45 | ≈ USD 0.04 – 0.08 |
| Sonnet 5.5 (`LLM_MODEL=claude-sonnet-5-5`) | ≈ USD 0.12 – 0.25 | ≈ USD 0.02 – 0.04 |

Con 10 a 30 contratos al mes, el costo es inferior a USD 5 mensuales. El costo relevante no es el del modelo sino el de un dato mal registrado, y por eso la extracción no depende del modelo.

## 5. Estrategia de extracción

**Determinista (regex + heurísticas) sobre el texto, por párrafos.** El modelo no extrae ni decide valores.

| Campo | Cómo | Confianza |
|---|---|---|
| `id_contrato` | `No. XX-AAAA-N` en el encabezado. En un otrosí se toma el contrato **referenciado** (`AL CONTRATO … No.`) | 0.95 |
| Contraparte | Patrón `NOMBRE, [identificada con] NIT/RUC/RTN n` en la cláusula de partes, excluyendo el NIT propio. El nombre con mayúsculas y minúsculas reales sale del **bloque de firmas** | 0.95 si coincide con las firmas, 0.7 si no |
| `nit_cliente` | Sin puntos ni dígito de verificación | 0.95 |
| `pais` | Tipo y longitud del identificador (NIT → CO, RUC de 13 → EC, de 11 → PE, RTN → HN), **contrastado con la ciudad del domicilio** | 0.95 si coinciden, 0.85 sin domicilio, 0.6 si hay conflicto |
| `valor` y `moneda` | La cifra entre paréntesis **dentro de la cláusula VALOR** (no en las garantías, que también traen montos). **El último separador con 1 o 2 dígitos es decimal**: `265.000.000` → 265000000 y `120,000.00` → 120000 | 0.95. Sin valor determinado: `0`, con confianza 0.5 |
| Fechas | "día (n) de mes de año" en la cláusula PLAZO, verificadas contra el plazo en meses si existe. Si solo hay "n meses desde la firma", la fecha fin es firma + n meses − 1 día | 0.95 explícitas, 0.6 derivadas, 0.5 si la firma no tiene día |
| Póliza | Cláusula de garantías y tipos normalizados. Una póliza **condicional** ("para cada orden cuyo valor supere…") baja la confianza. El cuerpo del correo corrobora o contradice | 0.95, 0.85 sin cláusula, 0.6 condicional, 0.5 si contradice el correo |

**Dónde entra el modelo:** decide el orden de las llamadas, interpreta la intención de la usuaria ("confirmo el valor 0…"), convierte lo dictado en `correcciones` tipadas (validadas con zod) y redacta el resumen. **Dónde no entra:** ningún valor que se registra sale del modelo. `validar` y `registrar` **vuelven a extraer del documento original**, así que el JSON que el modelo envía es solo informativo y no puede alterar montos ni fechas.

## 6. Regla de gobierno: registro corporativo de contratos

| # | Regla |
|---|---|
| **1. Canal único** | Todo contrato, otrosí, prórroga, acta de inicio y acta de terminación se envía a **contratos@periferia.com**. **Dueña del buzón y del maestro:** la Coordinación Administrativa (analista titular más un suplente designado), para que el proceso sobreviva a la rotación de personal. Ningún otro canal se considera recibido. |
| **2. Obligación del comercial** | Enviar el **PDF firmado por ambas partes** en un máximo de **3 días hábiles desde la firma**, **con o sin póliza**. Asunto: `[CONTRATO] <Cliente> · <N.º contrato> · <Nuevo / Otrosí / Terminación>`. Los contratos marco se envían igual, y cada orden de servicio de más de COP 100M se envía como anexo. |
| **3. Acuse automático** | En menos de 1 hora hábil el agente responde al comercial: recibido, clasificación (nuevo, actualización, duplicado o rechazado), número registrado y, si aplica, **qué falta** ("no se identificó la fecha de inicio", "la firma no tiene día"). |
| **4. Excepciones y escalamiento** | Un contrato **sin firmar** se rechaza con un acuse que lo explica y no se registra. Uno **sin valor** (por demanda) se registra con valor 0 tras confirmación de la analista, y cada orden posterior actualiza el registro. Si el remitente no está en el catálogo, se registra y se escala al director comercial para actualizar el catálogo. Si no hay respuesta del comercial en 5 días hábiles, se escala a su jefe directo; a los 10 días, al comité de gerencia. |
| **5. Cierre del gap (junio–agosto 2026)** | Una campaña de 2 semanas: (a) Finanzas extrae las **facturas emitidas** entre el 1 de junio y el 31 de agosto; (b) se cruzan contra el maestro por NIT; (c) cada cliente facturado sin contrato vigente genera una solicitud al comercial responsable; (d) los contratos recibidos entran por el buzón con fuente `migracion`. El cierre ocurre cuando el 100 % del monto facturado del trimestre tiene contrato en el maestro. |
| **6. Indicador** | **Cobertura contractual mensual = % del valor facturado en el mes cuyo cliente tiene un contrato vigente en el maestro.** Meta ≥ 95 %. Complementarios: tiempo medio entre la firma y el registro (≤ 3 días) y número de pólizas exigidas no vigentes (meta 0). |

**Sobre el dueño del maestro** (pregunta abierta del PRD): sin área legal, el dueño es **administrativo, no jurídico**. El agente y la analista garantizan que el dato exista y sea correcto, no la calidad de las cláusulas. Esa revisión se contrata con asesoría externa cuando un contrato supera un umbral de valor definido por gerencia.

## 7. Decisiones y trade-offs

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| D1 | **Extracción determinista** y modelo solo como orquestador | Extracción con el LLM y JSON estructurado | Reproducible, testeable sin clave, sin costo por extracción y sin "redondeos". El costo es que es frágil ante plantillas nuevas, y por eso la confianza baja cuando la regex no encuentra el dato y se escala a revisión humana. En producción, el LLM puede **proponer** como segunda opinión |
| D2 | **Guardia de confirmación en el servidor** | Confiar en el prompt | Un prompt es una instrucción, no un control. La guardia es auditable y probada en `tests/guardia.test.ts` |
| D3 | **Reextraer en `validar` y `registrar`** e ignorar el `contrato` que envía el modelo | Usar el objeto que pasa el modelo | Garantiza que lo que se registra sale del documento; las únicas modificaciones son `correcciones` explícitas de la usuaria |
| D4 | Bucle propio con `messages.create` | LangChain, Vercel AI SDK o el Tool Runner del SDK | El ciclo es lo que se evalúa. Escribirlo permite insertar la guardia, los topes y el log sin depender de un framework |
| D5 | Node 22 + tsx, Hono y HTML plano | Bun, Express, React | Menos piezas y arranque en un comando. El PRD permite Node 20+ |
| D6 | Render (servidor con estado) | Vercel | En serverless, cada petición puede caer en otra instancia y el disco es efímero: la confirmación del turno siguiente se perdería. Vercel exigiría Redis |
| D7 | `estado_poliza → pendiente` cuando un otrosí exige ampliar garantías | Dejar la póliza `vigente` | La póliza vigente no cubre el nuevo plazo. Mejor una alerta de más que una garantía vencida |

## 8. Supuestos

1. **msg-006, firma sin día.** "En el mes de agosto de 2026" se interpreta como inicio el 2026-08-01, con confianza 0.5. El PRD espera revisión de `valor` y `fecha_fin`; **también pongo `fecha_inicio` en revisión** porque es igual de incierta. Si la usuaria confirma "fin 2027-08-31", se registra lo que ella dicta.
2. **msg-006, póliza condicional.** Se propone `requiere_poliza = true`, `cumplimiento`, `pendiente`, con confianza 0.6 y en revisión.
3. **Moneda de un contrato sin valor.** Se toma la moneda nombrada en el texto (aquí COP, en la cláusula de garantías). Si no aparece, queda `null`.
4. **Comercial desconocido.** Se registra como `<email> (no registrado)`; no se infiere el nombre a partir de la firma del correo.
5. **Archivo de un otrosí.** Se guarda como `<id>-otrosi-<mensaje>.<ext>` junto al contrato original, sin sobrescribirlo. La fila conserva la ruta del contrato.
6. **Alertas.** "Registrados desde el corte" incluye altas **y actualizaciones** hechas por el buzón (CT-2026-011). Agrego una cuarta sección, "vencidos sin cierre" (CT-2025-018, CT-2026-002), que el PRD no pide pero que gerencia necesita.
7. **`fecha_registro`.** Es la fecha de ejecución o `FECHA_HOY`, para que la demo sea determinista.
8. **El objeto se registra literal**, recortado a 200 caracteres, no resumido. Resumirlo sería generar un dato que no está en el documento.

## 9. Cobertura

| HU | Estado | Evidencia | Falta para producción |
|---|---|---|---|
| HU-1 Leer el buzón | Hecho | `contratos_leer_buzon`; `demo.ts` | Conector Exchange/Graph con webhooks |
| HU-2 Extraer | Hecho (texto) | `core/extractor.ts`; 6 de 6 fixtures | OCR y PDF nativo (`leer_pdf`, P1 no implementado); más plantillas |
| HU-3 Validar y clasificar | Hecho | `core/clasificador.ts` | Deduplicación difusa por nombre de cliente |
| HU-4 Registrar y archivar | Hecho | `out/sharepoint/…`, historial, procesados | Graph API a SharePoint, concurrencia multiusuario |
| HU-5 Alertas | Hecho, más una sección extra | `out/alertas.md` | Envío programado a gerencia (correo o Teams) |
| HU-6 Errores | Hecho | `{ ok:false }` en todas las herramientas; tests | Reintentos y cola de mensajes fallidos |
| Agente, API, front | Hecho | `src/agent`, `src/server.ts`, `web/` | Autenticación SSO y roles |
| Bonus `modulo/` | No hecho | El prompt y el conocimiento ya tienen el frontmatter requerido | Empaquetar reutilizando los mismos archivos |

## 10. Uso de IA

| Asistente | Para qué | Qué descarté o corregí |
|---|---|---|
| **Claude Code (Claude Opus 5.5)** | Análisis de los fixtures para encontrar trampas, redacción de la especificación SDD, generación del código, de `demo.ts` y de los tests, y borrador de esta documentación | (1) Su primera sugerencia de despliegue incluía Vercel, que descarté por el estado entre peticiones (D6). (2) Propuso Bun, que reemplacé por Node porque no estaba instalado y el PRD lo permite. (3) La primera versión dejaba la moneda del contrato marco con confianza 0.5 sin justificación; la ajusté para tomar la moneda solo si el texto la nombra. (4) Un criterio de `demo.ts` tenía un error de precedencia que daba un falso fallo; lo corregí. (5) Endurecí la confirmación: no basta con el prompt, se agregó la guardia en el servidor. |

Todas las decisiones de interpretación (sección 8) las revisé y aprobé antes de implementarlas, y puedo explicar cada línea del código entregado.

## 11. Riesgos de producción y mitigación

| Riesgo | Mitigación |
|---|---|
| Plantillas de contrato nuevas rompen las regex | La confianza baja y el contrato va a revisión (nunca un dato malo silencioso). Ampliar fixtures con contratos reales anonimizados y medir el % que va a revisión |
| PDF escaneados | OCR (Azure Document Intelligence o Textract), con la confianza del OCR combinada con la de la extracción |
| El modelo se salta el flujo | La guardia del servidor, la reextracción desde el documento y el log completo de llamadas |
| Datos personales y contractuales enviados al proveedor LLM | Las herramientas devuelven datos estructurados, no el contrato completo. En producción: acuerdo de no retención, residencia de datos y anonimización de cédulas |
| Falsos duplicados o falsas actualizaciones | Deduplicación por NIT antes que por nombre, umbral de similitud alto (0.9) y advertencia visible cuando un cliente ya tiene otros contratos |
| Concurrencia en el maestro CSV | Escritura atómica hoy; en producción, una lista de SharePoint o una base de datos con bloqueo optimista |
| El proceso muere con la rotación | La regla de gobierno (sección 6) con dueño y suplente, más el indicador mensual de cobertura |
| Costo descontrolado del link público | Tope de iteraciones y de tokens por sesión, y `ACCESS_KEY` opcional |

### Alineación con marcos de gobierno de IA

| Control del agente | NIST AI RMF | ISO/IEC 42001 |
|---|---|---|
| Constitución, dueña del maestro y regla de gobierno con escalamiento | **GOVERN** (políticas, roles y responsabilidades) | 5.2 (política), 5.3 (roles) |
| Contexto y límites declarados: sin revisión jurídica, sin OCR | **MAP** (contexto de uso, limitaciones conocidas) | 6.1 (riesgos y oportunidades) |
| Confianza por campo, `demo.ts` y tests como verificación continua | **MEASURE** (validez y fiabilidad) | 9.1 (seguimiento y medición); Anexo A: verificación y validación |
| Revisión humana obligatoria bajo 0.8 y guardia en el servidor | **MANAGE** (tratamiento del riesgo, supervisión humana) | 8.1 (control operacional); Anexo A: uso responsable |
| `log.jsonl` + `historial.jsonl` append-only | **MEASURE / MANAGE** (trazabilidad, monitoreo) | Anexo A: registros de eventos |
| Clave solo en el backend y topes de costo | **MANAGE** (recursos y respuesta a riesgos) | Anexo A: datos y recursos |
