/**
 * Pantalla de escaneos: lanzar, seguir en vivo y revisar el historial.
 *
 * El progreso en vivo llega por SSE, y eso solo se puede ejercitar en un
 * navegador real: `EventSource` no existe en el entorno de los tests de
 * componente, donde hay que sustituirlo por un doble.
 */

import { expect, test } from "@playwright/test";
import {
  BUZON_ACTIVO,
  ESCANEO_EN_CURSO,
  ESCANEO_TERMINADO,
  flujoSse,
  iniciarSesion,
  respuesta,
  simularApi,
} from "./apoyo";

test.beforeEach(async ({ context }) => {
  await iniciarSesion(context);
});

test("el historial muestra el resultado de cada escaneo", async ({ page }) => {
  await simularApi(page);
  await page.goto("/escaneos");

  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();

  const tabla = page.getByRole("table", { name: /historial de escaneos/i });
  await expect(tabla).toBeVisible();
  await expect(tabla.getByText("Completado")).toBeVisible();
  await expect(tabla.getByText("Terminado")).toBeVisible();
});

test("sin ningún buzón conectado invita a vincular uno", async ({ page }) => {
  await simularApi(page, { "GET /mailboxes": respuesta([]) });
  await page.goto("/escaneos");

  await expect(page.getByText("No hay ningún buzón conectado")).toBeVisible();
  // Y no debe ofrecer lanzar un escaneo que fallaría.
  await expect(page.getByRole("button", { name: "Iniciar escaneo" })).toHaveCount(0);

  await page.getByRole("button", { name: /ir a buzones/i }).click();
  await expect(page).toHaveURL("/buzones");
});

test("un buzón suspendido no habilita el escaneo", async ({ page }) => {
  // Solo las conexiones activas sirven: con una suspendida el escaneo
  // moriría en el primer refresco de token.
  await simularApi(page, {
    "GET /mailboxes": respuesta([{ ...BUZON_ACTIVO, estado: "suspended" }]),
  });
  await page.goto("/escaneos");

  await expect(page.getByText("No hay ningún buzón conectado")).toBeVisible();
});

test("lanzar un escaneo y seguir su progreso en vivo", async ({ page }) => {
  await simularApi(page, {
    "POST /scans": respuesta(ESCANEO_EN_CURSO),
    "GET /scans": respuesta([ESCANEO_EN_CURSO]),
  });

  // El stream se intercepta aparte: no es JSON y la respuesta debe
  // llegar con el tipo de contenido de SSE para que `EventSource` la lea.
  await page.route(`**/api/bff/scans/${ESCANEO_EN_CURSO.id}/stream`, async (ruta) => {
    await ruta.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: flujoSse([
        { tipo: "progreso", datos: { ...ESCANEO_EN_CURSO, trabajo_id: ESCANEO_EN_CURSO.id } },
        {
          tipo: "progreso",
          datos: {
            ...ESCANEO_TERMINADO,
            trabajo_id: ESCANEO_EN_CURSO.id,
            estado: "succeeded",
            fase: "done",
            progreso_porcentaje: 100,
          },
        },
      ]),
    });
  });

  await page.goto("/escaneos");
  await page.getByRole("button", { name: "Iniciar escaneo" }).click();

  // La barra de progreso debe anunciar su valor, no solo pintarlo.
  const progreso = page.getByRole("progressbar", { name: /progreso del escaneo/i });
  await expect(progreso).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
});

test("un escaneo en curso se puede seguir y cancelar", async ({ page }) => {
  let cancelado = false;
  await simularApi(page, { "GET /scans": respuesta([ESCANEO_EN_CURSO]) });
  await page.route(`**/api/bff/scans/${ESCANEO_EN_CURSO.id}/cancel`, async (ruta) => {
    cancelado = true;
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(respuesta({ ...ESCANEO_EN_CURSO, estado: "cancelled" })),
    });
  });

  await page.goto("/escaneos");

  const fila = page.getByRole("row").filter({ hasText: "En curso" });
  await expect(fila.getByRole("button", { name: "Seguir" })).toBeVisible();
  await fila.getByRole("button", { name: "Cancelar" }).click();

  await expect.poll(() => cancelado).toBe(true);
});

test("un escaneo terminado no ofrece cancelar", async ({ page }) => {
  await simularApi(page);
  await page.goto("/escaneos");

  const fila = page.getByRole("row").filter({ hasText: "Completado" });
  await expect(fila.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
});

test("un error al lanzar se muestra con el mensaje del backend", async ({ page }) => {
  await simularApi(page);
  await page.route("**/api/bff/scans", async (ruta) => {
    if (ruta.request().method() !== "POST") {
      await ruta.fallback();
      return;
    }
    await ruta.fulfill({
      status: 429,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:mailauto:error:limite_de_escaneos",
        title: "Demasiados escaneos",
        detail: "Has alcanzado el límite de escaneos por hora.",
      }),
    });
  });

  await page.goto("/escaneos");
  await page.getByRole("button", { name: "Iniciar escaneo" }).click();

  // El texto viene del backend, ya redactado: la interfaz no inventa.
  await expect(page.getByText("Has alcanzado el límite de escaneos por hora.")).toBeVisible();
});
