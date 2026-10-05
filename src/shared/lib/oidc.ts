/**
 * Cliente OIDC del BFF.
 *
 * Propósito
 *   Completar el flujo Authorization Code + PKCE contra el proveedor
 *   de identidad, enteramente del lado servidor.
 *
 * Por qué `openid-client` y no unas llamadas a `fetch`
 *   El flujo en sí son unas sesenta líneas, pero la parte que importa
 *   no es pedir el token: es validarlo. Enlazar el `nonce`, verificar
 *   la firma del ID token contra un JWKS que rota, comprobar `iss`,
 *   `aud`, `exp` y el desfase de reloj. Cada una de esas
 *   comprobaciones falla en silencio si se omite, y ninguna se nota
 *   hasta que alguien la explota. `openid-client` es la
 *   implementación de referencia, del autor de `node-oidc-provider`,
 *   y está mantenida al día.
 *
 * Qué NO hace
 *   No toca el navegador. Todo ocurre en route handlers: el
 *   `client_secret` y el `code_verifier` no salen del servidor, y el
 *   access token acaba en la cookie cifrada, nunca en el bundle.
 */

import * as client from "openid-client";
import { entornoDeServidor } from "@/shared/config/entorno";

/**
 * Configuración descubierta del proveedor, cacheada en el proceso.
 *
 * El documento de descubrimiento cambia muy rara vez y pedirlo en
 * cada login añadiría una ida y vuelta a la ruta más sensible.
 */
let configuracionCacheada: client.Configuration | undefined;

export async function configuracionOidc(): Promise<client.Configuration> {
  if (configuracionCacheada) return configuracionCacheada;

  const entorno = entornoDeServidor();
  configuracionCacheada = await client.discovery(
    new URL(entorno.OIDC_ISSUER),
    entorno.OIDC_CLIENT_ID,
    entorno.OIDC_CLIENT_SECRET,
  );
  return configuracionCacheada;
}

export function urlDeRetorno(): string {
  return `${entornoDeServidor().APP_URL}/api/auth/callback`;
}

/**
 * Alcances solicitados.
 *
 * `offline_access` es lo que hace que el proveedor emita un refresh
 * token; sin él, la sesión muere al vencer el access token y el
 * usuario tiene que volver a entrar cada hora.
 */
export const ALCANCES = "openid profile email offline_access";
