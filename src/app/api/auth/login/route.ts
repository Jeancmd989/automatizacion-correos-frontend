/**
 * Inicio de sesión: redirige al proveedor de identidad.
 *
 * El `code_verifier`, el `state` y el `nonce` se guardan en la sesión
 * cifrada antes de redirigir. Nunca viajan al navegador en claro: esa
 * es exactamente la garantía que aporta PKCE, y el motivo de que el
 * flujo viva aquí y no en un componente de cliente.
 */

import * as client from "openid-client";
import { NextResponse } from "next/server";
import { ALCANCES, configuracionOidc, urlDeRetorno } from "@/shared/lib/oidc";
import { entornoDeServidor } from "@/shared/config/entorno";
import { leerSesion } from "@/shared/lib/sesion";

export async function GET(): Promise<NextResponse> {
  const entorno = entornoDeServidor();
  const configuracion = await configuracionOidc();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const sesion = await leerSesion();
  // Se guardan en la propia cookie de sesión: sobreviven la ida al
  // proveedor y se consumen una sola vez en el callback.
  Object.assign(sesion, { pkce: codeVerifier, state, nonce });
  await sesion.save();

  const destino = client.buildAuthorizationUrl(configuracion, {
    redirect_uri: urlDeRetorno(),
    scope: ALCANCES,
    // El `audience` es lo que hace que el proveedor emita un token
    // para ESTA API y no uno genérico de perfil.
    audience: entorno.OIDC_AUDIENCE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return NextResponse.redirect(destino.href);
}
