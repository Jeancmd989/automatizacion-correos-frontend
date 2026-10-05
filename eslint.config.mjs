import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Configuracion de ESLint (flat config).
 *
 * `eslint-config-next` 16 exporta flat config de forma nativa, asi que
 * no hace falta el puente `FlatCompat`: importarlo directamente es mas
 * simple y evita una dependencia de compatibilidad.
 */
const configuracion = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Generado desde el contrato OpenAPI del backend: editarlo a mano
      // es justo lo que la generacion existe para impedir.
      "src/generated/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Un `any` suelto anula el tipado de todo lo que toca aguas abajo.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // El token de acceso vive en la sesion del servidor y nunca en el
      // navegador: cualquier uso de almacenamiento local es sospechoso.
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message:
            "No almacenar credenciales ni estado de sesion en el navegador: el token vive en la cookie httpOnly del BFF.",
        },
        {
          name: "sessionStorage",
          message: "Ver la nota de localStorage.",
        },
      ],
    },
  },
];

export default configuracion;
