/**
 * Configuración validada del entorno.
 *
 * Propósito
 *   Que un despliegue mal configurado falle al construir o al arrancar,
 *   y no en la primera petición de un usuario real.
 *
 * Decisión de diseño
 *   Dos esquemas separados, servidor y cliente. En Next.js todo lo que
 *   se importa desde un componente de cliente acaba en el bundle que
 *   descarga el navegador: si el secreto de OIDC estuviera en el mismo
 *   objeto que la URL pública de la API, bastaría con que un componente
 *   de cliente importara ese objeto para publicarlo. Separarlos hace
 *   que ese error sea imposible en vez de improbable.
 */

import { z } from "zod";

const esquemaDeServidor = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /** URL interna del backend. Solo la usa el BFF, nunca el navegador. */
  API_URL: z.string().url(),

  /** Proveedor de identidad (OIDC). */
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_AUDIENCE: z.string().min(1),

  /**
   * Clave de firma de la cookie de sesión. 32 bytes como mínimo: por
   * debajo, un atacante puede forjar sesiones por fuerza bruta.
   */
  SESSION_SECRET: z.string().min(32),

  /** Origen público de esta aplicación, para construir el redirect_uri. */
  APP_URL: z.string().url(),
});

const esquemaDeCliente = z.object({
  /** Nombre visible del producto. Lo único que el navegador necesita. */
  NEXT_PUBLIC_APP_NAME: z.string().default("Automatización de Correos"),
});

type ConfiguracionDeServidor = z.infer<typeof esquemaDeServidor>;
type ConfiguracionDeCliente = z.infer<typeof esquemaDeCliente>;

let cacheDeServidor: ConfiguracionDeServidor | undefined;

/**
 * Configuración del servidor. Lanza si falta algo obligatorio.
 *
 * Es una función y no una constante exportada a propósito: una constante
 * se evaluaría al importar el módulo, y eso haría fallar el build en
 * entornos donde las variables todavía no están inyectadas.
 */
export function entornoDeServidor(): ConfiguracionDeServidor {
  if (typeof window !== "undefined") {
    // Red de seguridad: si este módulo acaba en un bundle de cliente por
    // un import descuidado, el fallo es inmediato y evidente en
    // desarrollo, en lugar de publicar los secretos en silencio.
    throw new Error(
      "entornoDeServidor() no puede invocarse desde el navegador.",
    );
  }

  if (cacheDeServidor) return cacheDeServidor;

  const resultado = esquemaDeServidor.safeParse(process.env);
  if (!resultado.success) {
    const faltantes = resultado.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de servidor inválida:\n${faltantes}`);
  }

  cacheDeServidor = resultado.data;
  return cacheDeServidor;
}

/** Configuración disponible en el navegador. Nunca contiene secretos. */
export const entornoDeCliente: ConfiguracionDeCliente = esquemaDeCliente.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});
