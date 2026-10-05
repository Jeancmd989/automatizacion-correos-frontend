import { defineConfig } from "orval";

/**
 * Generacion del cliente a partir del contrato del backend.
 *
 * El contrato se versiona en `contrato/openapi.json` y es la copia
 * autoritativa para este repositorio. Se lee de disco y no de una URL
 * porque el repositorio del backend es privado: una descarga anonima
 * devuelve 404, y meter un token de otro repositorio en el camino
 * critico de cada pull request es fragilidad a cambio de nada.
 *
 * El refresco lo hace `.github/workflows/sincronizar-contrato.yml`,
 * que abre un pull request cuando el backend cambia. Asi la
 * actualizacion del contrato se revisa como cualquier otro cambio, en
 * lugar de colarse en silencio.
 *
 *   npm run api:generate                        # desde el contrato versionado
 *   OPENAPI_URL=http://localhost:8000/openapi.json npm run api:generate
 */
export default defineConfig({
  mailauto: {
    input: {
      target: process.env.OPENAPI_URL ?? "./contrato/openapi.json",
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
        fetch: {
          // Sin la envoltura {data, status, headers}: el mutator ya
          // lanza ante una respuesta de error, asi que el estado y
          // las cabeceras no aportan nada en el camino feliz y
          // obligarian a escribir `respuesta.data.data` en cada uso.
          includeHttpResponseReturnType: false,
        },
      },
      clean: true,
    },
  },
});
