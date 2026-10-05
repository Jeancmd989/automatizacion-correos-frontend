/**
 * Callback de OIDC: canjea el código por tokens y abre la sesión.
 *
 * Es la ruta más sensible de la aplicación. Tres comprobaciones que
 * no se pueden omitir, y que `openid-client` realiza a partir de lo
 * que se le pasa aquí:
 *
 *   - `state`: el que vuelve tiene que ser el que se emitió, y de un
 *     solo uso. Es la defensa contra CSRF en el callback.
 *   - `nonce`: enlaza el ID token con esta petición concreta, de modo
 *     que uno capturado en otra sesión no sirve.
 *   - `code_verifier`: sin él el código interceptado no se puede
 *     canjear, que es toda la razón de ser de PKCE.
 *
 * Los tres se leen de la sesión cifrada y se borran antes de guardar
 * el token: dejarlos ahí convertiría un secreto de un solo uso en uno
 * reutilizable durante toda la sesión.
 */

import * as client from "openid-client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { entornoDeServidor } from "@/shared/config/entorno";
import { configuracionOidc, urlDeRetorno } from "@/shared/lib/oidc";
import { leerSesion } from "@/shared/lib/sesion";

interface EstadoPkce {
  pkce?: string;
  state?: string;
  nonce?: string;
}

export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const entorno = entornoDeServidor();
  const sesion = await leerSesion();
  const pendiente = sesion as unknown as EstadoPkce;

  const { pkce, state, nonce } = pendiente;
  if (!pkce || !state || !nonce) {
    // Callback sin flujo iniciado: enlace reproducido, sesión
    // caducada o un intento de forzar la ruta. No se distingue el
    // motivo porque ninguno merece una pista.
    return redirigirConError(entorno.APP_URL, "flujo_invalido");
  }

  // Consumo único: se borran ANTES de canjear, para que un segundo
  // intento con el mismo código no encuentre nada que usar.
  delete pendiente.pkce;
  delete pendiente.state;
  delete pendiente.nonce;
  await sesion.save();

  try {
    const configuracion = await configuracionOidc();
    const tokens = await client.authorizationCodeGrant(
      configuracion,
      new URL(peticion.url),
      {
        pkceCodeVerifier: pkce,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      },
      { redirect_uri: urlDeRetorno() },
    );

    const reclamaciones = tokens.claims();
    sesion.accessToken = tokens.access_token;
    if (tokens.refresh_token) sesion.refreshToken = tokens.refresh_token;
    sesion.venceEn =
      Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600);
    // Asignacion condicional: con `exactOptionalPropertyTypes`, poner
    // `undefined` en un campo opcional no es lo mismo que omitirlo, y
    // ademas dejaria la clave presente con valor vacio en la cookie.
    if (reclamaciones?.sub) sesion.sub = reclamaciones.sub;
    if (typeof reclamaciones?.email === "string") {
      sesion.email = reclamaciones.email;
    }
    await sesion.save();

    return NextResponse.redirect(`${entorno.APP_URL}/escaneos`);
  } catch {
    // El detalle del fallo (firma inválida, nonce que no cuadra,
    // código ya usado) se queda aquí: al navegador solo le llega que
    // no se pudo iniciar sesión.
    sesion.destroy();
    return redirigirConError(entorno.APP_URL, "autenticacion_fallida");
  }
}

function redirigirConError(base: string, codigo: string): NextResponse {
  return NextResponse.redirect(`${base}/?error=${codigo}`);
}
