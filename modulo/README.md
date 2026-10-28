# Módulo reutilizable (bonus PRD §9.4)

El agente empaquetado para integrarlo en otras plataformas de agentes, sin depender del servidor de esta aplicación.

| Pieza | Qué es | Origen (la misma pieza que usa la app) |
|---|---|---|
| `agent.md` | Frontmatter `description`, `mode: primary`, `permission { edit: deny, bash: deny }`; el cuerpo es el system prompt | Enlace simbólico a [`agent/prompt.md`](../agent/prompt.md) |
| `tools/contratos.ts` | Las 5 herramientas `contratos_*` (`{ description, args (zod), execute(args, ctx) }`) | Reexporta [`src/tools/contratos.ts`](../src/tools/contratos.ts) |
| `skill/registro-contratos/SKILL.md` | Frontmatter `name`, `description`; el cuerpo es el conocimiento del proceso | Enlace simbólico a [`src/knowledge/registro-contratos.md`](../src/knowledge/registro-contratos.md) |

**No hay copias divergentes.** Editar el prompt, el conocimiento o una herramienta de la app cambia el módulo, y al revés. `tests/modulo.test.ts` lo verifica en cada `npm test`:
- Los enlaces resuelven a los mismos archivos.
- Las herramientas son los mismos objetos.
- El frontmatter cumple el formato.
- Las herramientas se ejecutan sin levantar el servidor.

## Uso desde otra plataforma

```ts
import * as contratos from "./modulo/tools/contratos.ts"

// ctx.directory = raíz donde están fixtures/ (lectura) y out/ (escritura)
const ctx = { directory: process.cwd(), sessionId: "mi-sesion" }
const r = JSON.parse(await contratos.leer_buzon.execute({}, ctx)) // { ok: true, data: { mensajes, ya_procesados } }
```

La plataforma anfitriona debe aplicar la misma regla que impone el servidor de esta app: **`confirmado: true` en `contratos_registrar` solo con una confirmación explícita de la persona en un turno posterior a la pregunta** (constitución P3). La herramienta, por sí sola, sigue rechazando la escritura de campos en revisión sin `confirmado`.

En Windows, clona con `git config core.symlinks true` para que los enlaces se resuelvan.
