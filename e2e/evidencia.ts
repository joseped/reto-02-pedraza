// Capturas de evidencia. capturar() solo guarda cuando EVIDENCIA=1 (lo activa scripts/evidencia.sh).

import type { Locator, Page } from "@playwright/test"

const DIR = "docs/evidencia/capturas"

/**
 * Captura un elemento completo. El chat vive en un contenedor con scroll y Playwright recorta al
 * área visible, así que primero se agranda la ventana a la altura total del contenido.
 */
export async function fotoElemento(objetivo: Locator, ruta: string): Promise<void> {
  const page = objetivo.page()
  const original = page.viewportSize() ?? { width: 1440, height: 900 }
  const alto = await page.evaluate(() => (document.querySelector("#chat")?.scrollHeight ?? 0) + 400)
  await page.setViewportSize({ width: original.width, height: Math.max(original.height, alto) })
  await objetivo.screenshot({ path: ruta })
  await page.setViewportSize(original)
}

export async function capturar(objetivo: Page | Locator, nombre: string): Promise<void> {
  if (process.env.EVIDENCIA !== "1") return
  const ruta = `${DIR}/${nombre}.png`
  if ("goto" in objetivo) await objetivo.screenshot({ path: ruta, fullPage: true })
  else await fotoElemento(objetivo, ruta)
}
