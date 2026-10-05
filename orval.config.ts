import { defineConfig } from "orval";

/**
 * Generacion del cliente a partir del contrato del backend.
 *
 * El backend versiona `openapi.json` en su repositorio y el CI de aqui
 * lo descarga y regenera. Si el backend renombra un campo, el
 * `typecheck` de este repositorio falla en el pull request en lugar de
 * romperse en produccion.
 *
 *   npm run api:generate
 */
export default defineConfig({
  mailauto: {
    input: {
      target:
        process.env.OPENAPI_URL ??
        "https://raw.githubusercontent.com/Jeancmd989/automatizacion-correos-backend/main/openapi.json",
    },
    output: {
      mode: "tags-split",
      target: "src/generated/api",
      schemas: "src/generated/model",
      client: "react-query",
      httpClient: "fetch",
      // Todas las llamadas pasan por el BFF, que añade el token del lado
      // servidor. El cliente generado nunca habla con el backend
      // directamente ni maneja credenciales.
      override: {
        mutator: {
          path: "src/shared/lib/cliente-bff.ts",
          name: "peticionAlBff",
        },
      },
      clean: true,
    },
  },
});
