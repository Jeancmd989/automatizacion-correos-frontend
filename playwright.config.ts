/**
 * Configuración de Playwright.
 *
 * Propósito
 *   Ejercitar la aplicación en un navegador real: redirecciones de
 *   Server Components, la cookie de sesión y el flujo de cada pantalla.
 *   Es lo que `vitest` con Testing Library no puede cubrir, porque allí
 *   no hay servidor, ni cookies, ni navegación.
 *
 * Decisiones de diseño
 *   1. Sin backend ni proveedor de identidad. Las respuestas de datos se
 *      interceptan en `/api/bff/**`, que es una petición del navegador a
 *      este mismo servidor, así que Playwright puede responderla. La
 *      sesión se construye sellando una cookie `iron-session` con el
 *      mismo secreto que usa la aplicación. Montar un Auth0 y un backend
 *      reales para probar la interfaz haría la suite lenta, frágil y
 *      dependiente de credenciales que no deben estar en el repositorio.
 *
 *   2. Se prueba contra el build de producción (`next build && next
 *      start`) y no contra el servidor de desarrollo. El modo
 *      desarrollo recompila bajo demanda: los primeros `goto` tardan
 *      segundos y los tests se vuelven inestables por tiempos de espera
 *      que no tienen nada que ver con la aplicación. Además el build es
 *      lo que se despliega.
 *
 *   3. `webServer` arranca el servidor por su cuenta. Un `reuseExisting`
 *      en local evita rebuildar en cada ejecución mientras se escribe un
 *      test.
 */

import { defineConfig, devices } from "@playwright/test";

const PUERTO = 3100;
const URL_BASE = `http://localhost:${PUERTO}`;

// Valores de prueba, no credenciales. El secreto solo sirve para sellar
// la cookie de sesión de esta suite y el proveedor OIDC nunca se llama:
// las pantallas que necesitan sesión la reciben ya sellada.
const ENTORNO_DE_PRUEBAS = {
  NODE_ENV: "production",
  API_URL: "http://localhost:8099",
  APP_URL: URL_BASE,
  OIDC_ISSUER: "https://pruebas.ejemplo.com",
  OIDC_CLIENT_ID: "cliente-de-pruebas",
  OIDC_CLIENT_SECRET: "secreto-de-pruebas",
  OIDC_AUDIENCE: "https://api.ejemplo.com",
  SESSION_SECRET: "secreto-de-sesion-solo-para-pruebas-e2e-32+",
  NEXT_PUBLIC_APP_NAME: "Automatización de Correos",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Se omite fuera de CI en lugar de pasar `undefined`: con
  // `exactOptionalPropertyTypes` no son lo mismo, y el valor por defecto
  // de Playwright ya se adapta a la maquina.
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: URL_BASE,
    // Solo en el reintento: una traza por test multiplica el tiempo y el
    // espacio, y lo que interesa es la del fallo.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npm run build && npx next start --port ${PUERTO}`,
    url: URL_BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: ENTORNO_DE_PRUEBAS,
  },
});

export { ENTORNO_DE_PRUEBAS, URL_BASE };
