---
name: registro-contratos
description: Reglas de negocio del registro de contratos vigentes de Periferia (maestro, clasificación, pólizas, alertas). Úsalo para interpretar los resultados de las herramientas contratos_*.
---

# Conocimiento: registro de contratos vigentes

## Contexto
- El maestro de contratos estuvo **congelado desde el 2026-05-30**. Antes solo llegaban a administración los contratos con póliza; ahora todo contrato debe llegar al buzón único.
- No hay área legal interna: el agente **no revisa cláusulas**, solo registra datos.

## Clasificación (RN1–RN4)
| Clasificación | Cuándo | Qué se escribe |
|---|---|---|
| `duplicado` | Mismo `id_contrato` con el mismo valor, fecha de inicio y fecha de fin | Nada; solo se marca el mensaje como procesado |
| `actualizacion` | Mismo `id_contrato` con algún campo distinto, o un otrosí, o mismo NIT + objeto con similitud ≥ 0.9 | Se actualiza la fila; las diferencias van al historial |
| `nuevo` | Sin coincidencias | Se inserta la fila |
| `rechazado` | Sin adjunto de contrato (por ejemplo, una cotización) o sin partes ni objeto | Nada; se reporta el motivo |

Un cliente puede tener varios contratos: compartir NIT **no** convierte un contrato en actualización si el objeto es distinto.

## Confianza y revisión (RN5)
- Cada campo extraído tiene una confianza entre 0 y 1. **Menos de 0.8 ⇒ revisión humana** antes de registrar.
- Causas típicas de baja confianza: contrato marco sin valor (se propone 0), firma sin día (se asume el día 1), fecha fin derivada de un plazo en meses, póliza condicional.
- Un remitente que no está en el catálogo de comerciales se reporta, pero **no bloquea**.

## Campos del maestro
- `nit_cliente`: sin puntos ni dígito de verificación.
- `valor`: sin separadores. Es `0` si el contrato es por demanda.
- `estado_poliza`: un registro nuevo con póliza queda `pendiente`; sin póliza, `no_aplica`. Un otrosí que exige ampliar garantías deja la póliza `pendiente` hasta que se renueve.
- Archivo: `Contratos/<año de inicio>/<cliente>/<id_contrato>.<ext>`.

## Alertas
1. Contratos que vencen en ≤ 60 días.
2. Contratos que requieren póliza y cuya póliza no está vigente.
3. Contratos registrados o actualizados por el buzón desde el corte (cierre del gap).
4. Contratos vencidos que siguen en el maestro sin acta de cierre (adicional).
