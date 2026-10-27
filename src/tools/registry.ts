// Descubre las herramientas exportadas y las nombra `<archivo>_<export>` (PRD §6.2).
// El backend valida los argumentos con zod antes de ejecutar y devuelve el error al modelo si no cumplen.

import { z } from "zod"
import type { DefinicionHerramienta } from "../llm/adapter.ts"
import type { Ctx } from "../core/store.ts"
import * as contratos from "./contratos.ts"

type Ejecutor = (args: never, ctx: Ctx) => Promise<string>
type Herramienta = { description: string; args: z.ZodRawShape; execute: Ejecutor }

export type HerramientaRegistrada = {
  nombre: string
  definicion: DefinicionHerramienta
  esquema: z.ZodObject<z.ZodRawShape>
  ejecutar: (args: unknown, ctx: Ctx) => Promise<string>
}

const MODULOS: Record<string, Record<string, Herramienta>> = { contratos }

export const HERRAMIENTAS: HerramientaRegistrada[] = Object.entries(MODULOS).flatMap(([archivo, exports]) =>
  Object.entries(exports).map(([exp, h]) => {
    const nombre = `${archivo}_${exp}`
    const esquema = z.object(h.args).strict()
    const { $schema: _omitido, ...json } = z.toJSONSchema(esquema) as Record<string, unknown>
    return {
      nombre,
      definicion: { nombre, descripcion: h.description, esquema: json },
      esquema,
      ejecutar: h.execute as (args: unknown, ctx: Ctx) => Promise<string>,
    }
  }),
)

export const buscarHerramienta = (nombre: string) => HERRAMIENTAS.find((h) => h.nombre === nombre)
