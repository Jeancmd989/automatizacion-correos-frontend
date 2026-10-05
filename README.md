# Automatización de Correos — Frontend

Interfaz de operación de la [plataforma de automatización de correos](https://github.com/Jeancmd989/automatizacion-correos-backend):
vincular buzones, lanzar escaneos, seguir su progreso en vivo, revisar
registros y descargar reportes.

**Next.js 16** (App Router) · **React 19** · **TypeScript strict** · **Tailwind CSS 4** ·
**TanStack Query** · cliente de API generado desde el contrato del backend.

---

## Estado

Implementada la **Fase 0** del [plan de arquitectura](https://github.com/Jeancmd989/automatizacion-correos-backend/blob/main/ARQUITECTURA.md#17-plan-de-implementación-por-fases):
cimientos del proyecto. Build, linting, tipado estricto, tests y CI funcionando sobre una
estructura lista para construir encima.

**La interfaz de operación es la Fase 6** y todavía no está escrita. Lo que hay hoy:

| Pieza | Estado |
|-------|--------|
| Configuración de entorno validada, separando servidor y cliente | ✅ |
| Cliente HTTP contra el BFF, con traducción de errores RFC 9457 | ✅ |
| Generación del cliente de API desde el `openapi.json` del backend | ✅ configurada |
| Cabeceras de seguridad, tokens de diseño, accesibilidad base | ✅ |
| CI: linting, tipado, tests, build, auditoría y sincronía de contrato | ✅ |
| Rutas del BFF (login OIDC, sesión, proxy) | pendiente — Fase 6 |
| Features: buzones, escaneos, registros, revisión, reportes | pendiente — Fase 6 |

**Verificación actual:** 7 tests en verde, `eslint` y `tsc --noEmit` limpios, build de
producción correcto, cero vulnerabilidades en dependencias de producción.

---

## Puesta en marcha

```bash
cp .env.example .env.local
```

Genera el secreto de sesión y pégalo en `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```bash
npm install && npm run dev
```

La aplicación queda en http://localhost:3000. Necesita el backend en `API_URL`
(por defecto `http://localhost:8000`).

---

## Verificación

Lo mismo que ejecuta el CI:

```bash
npm run verify
```

Equivale a `lint` + `typecheck` + `test`. Para el build de producción:

```bash
npm run build
```

---

## Cliente de API

Backend y frontend viven en repositorios separados, así que el cliente TypeScript no
puede regenerarse en el mismo commit que cambia la API. El contrato compartido es el
`openapi.json` que el backend versiona.

```bash
npm run api:generate
```

Descarga el esquema, regenera `src/generated/` y lo deja listo para commitear. **El CI
falla si el resultado difiere de lo versionado**, de modo que un campo renombrado en el
backend rompe el pull request aquí en lugar de romperse en producción.

Para trabajar contra un backend local con cambios sin publicar:

```bash
OPENAPI_URL=http://localhost:8000/openapi.json npm run api:generate
```

`src/generated/` está excluido del linting y de los tests: su corrección la garantiza el
contrato, no una prueba escrita a mano. Editarlo manualmente es exactamente lo que la
generación existe para impedir.

---

## Estructura

```
src/
├── app/           Rutas (App Router) — solo composición
│   └── api/bff/   Backend for Frontend: sesión, OIDC y proxy  (Fase 6)
├── features/      Feature-sliced: cada carpeta es autocontenida  (Fase 6)
│   └── <feature>/{components,hooks,api,schemas}
├── shared/
│   ├── config/    configuración de entorno validada
│   ├── lib/       cliente del BFF, utilidades
│   └── ui/        design system
└── generated/     ⚠ GENERADO desde OpenAPI — no editar a mano
```

Cada feature agrupa su UI, su lógica y sus llamadas. Es lo que evita el hook de 350
líneas que concentraba estado, polling, OAuth y notificaciones en el sistema de
referencia: cada feature expone dos o tres hooks pequeños y testeables.

---

## Seguridad

**El access token nunca llega al navegador.** El login OIDC se completa en route handlers
del servidor; el navegador solo recibe una cookie de sesión `httpOnly`, `Secure`,
`SameSite=Lax`. Las llamadas pasan por el BFF, que adjunta el token del lado servidor.

Esto elimina una clase entera de ataques: con el token en memoria accesible desde
JavaScript —como ocurre con las librerías OIDC de cliente habituales—, cualquier XSS lo
roba y obtiene acceso directo a la API. Aquí lo máximo que consigue es hacer peticiones
desde la sesión ya abierta: un daño acotado, auditable y revocable cerrando la sesión.

El linter lo respalda: `localStorage` y `sessionStorage` están prohibidos por regla, con
un mensaje que explica por qué.

**Otros controles.** Cabeceras de endurecimiento (`X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS) declaradas en
`next.config.ts` para que apliquen también a los recursos estáticos. `poweredByHeader`
desactivado. La configuración de entorno se valida con Zod al arrancar, con esquemas
separados para servidor y cliente de modo que un secreto no pueda acabar en el bundle
por un import descuidado. Metadatos con `robots: noindex`: la aplicación maneja datos
fiscales y no debe aparecer en buscadores.

**Nota sobre `npm audit`.** Las dependencias de producción están limpias. Quedan avisos
de severidad alta en la cadena de `eslint-config-next` (`fast-glob` → `micromatch` →
`braces`) **sin versión parcheada disponible**: el rango afectado es `*`. Las `overrides`
del `package.json` ya fuerzan lo último publicado. El CI audita producción desde
severidad moderada y desarrollo solo ante críticas, para no tener el pipeline en rojo
permanente por algo que nadie puede arreglar todavía.

---

## Accesibilidad

Objetivo WCAG 2.2 AA. Ya en los cimientos: enlace de salto al contenido, `:focus-visible`
siempre visible, `prefers-reduced-motion` respetado, y tokens de color definidos en
`oklch` con variante para modo oscuro, declarados una sola vez para que la paleta se
pueda cambiar sin recorrer la interfaz entera.

---

## Despliegue

```bash
docker build -t automatizacion-correos-frontend .
```

Imagen en tres etapas con la salida `standalone` de Next: la imagen final lleva solo los
módulos que el build determina que se usan, corre como usuario sin privilegios e incluye
sonda de salud.
