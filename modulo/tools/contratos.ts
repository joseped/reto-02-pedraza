// Herramientas del agente para plataformas externas. No es una copia: reexporta los mismos objetos
// que usa la aplicación (src/tools/contratos.ts). No importa el servidor HTTP ni el ciclo del agente.
// Cada export se expone como `contratos_<export>`; execute(args, ctx) devuelve { ok, data } | { ok:false, error }.

export { alertas, extraer, leer_buzon, registrar, validar } from "../../src/tools/contratos.ts"
