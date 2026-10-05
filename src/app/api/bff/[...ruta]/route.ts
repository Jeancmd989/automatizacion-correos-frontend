/**
 * Proxy del BFF hacia el backend.
 *
 * Propósito
 *   Ser el único camino por el que el navegador alcanza la API, con
 *   el token añadido del lado servidor.
 *
 * Decisiones
 *   1. **Allowlist de prefijos.** Sin ella, este handler sería un
 *      proxy abierto: cualquiera con sesión podría alcanzar rutas
 *      internas del backend, o `/metrics`, pasando por aquí. Se
 *      permite exactamente lo que la interfaz usa.
 *
 *   2. **Refresco transparente.** Si el token está por vencer se
 *      renueva antes de reenviar. Sin esto, el usuario vería un 401
 *      aleatorio cada hora y lo interpretaría como un fallo de la
 *      aplicación.
 *
 *   3. **Cabeceras filtradas en ambos sentidos.** Hacia el backend se
 *      envía solo lo necesario; de vuelta se descarta todo lo que
 *      pueda confundir al navegador (longitud y codificación, que ya
 *      no corresponden tras pasar por aquí).
 *
 *   4. **Streaming conservado.** El progreso en vivo de un escaneo
 *      llega por SSE: si este proxy acumulara la respuesta, el
 *      usuario no vería nada hasta que el escaneo terminara, que es
 *      justo lo contrario de lo que el SSE existe para dar.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as client from "openid-client";
import { entornoDeServidor } from "@/shared/config/entorno";
import { configuracionOidc } from "@/shared/lib/oidc";
import { leerSesion, tokenVigente } from "@/shared/lib/sesion";

/**
 * Rutas del backend que la interfaz puede alcanzar.
 *
 * Es una allowlist de prefijos, comparada tras normalizar: lo que no
 * esté aquí devuelve 404 y no llega a salir de este proceso.
 */
const PREFIJOS_PERMITIDOS = [
  "me",
  "mailboxes",
  "scans",
  "records",
  "review",
  "reports",
  "audit",
] as const;

const METODOS_CON_CUERPO = new Set(["POST", "PUT", "PATCH"]);

/** Cabeceras que se reenvían al backend. Todo lo demás se descarta. */
const CABECERAS_HACIA_EL_BACKEND = [
  "content-type",
  "accept",
  "x-tenant-id",
  "x-request-id",
  "idempotency-key",
];

/**
 * Cabeceras que NO se devuelven al navegador.
 *
 * `content-length` y `content-encoding` describen el cuerpo tal como
 * salió del backend; tras pasar por aquí pueden no coincidir y el
 * navegador cortaría la respuesta a medias.
 */
const CABECERAS_A_DESCARTAR = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

async function manejar(
  peticion: NextRequest,
  contexto: { params: Promise<{ ruta: string[] }> },
): Promise<Response> {
  const { ruta } = await contexto.params;
  const destino = ruta.join("/");

  if (!rutaPermitida(destino)) {
    return NextResponse.json({ detail: "No encontrado" }, { status: 404 });
  }

  const sesion = await leerSesion();
  const token = await tokenValido(sesion);
  if (!token) {
    return NextResponse.json({ detail: "Sesion expirada" }, { status: 401 });
  }

  const entorno = entornoDeServidor();
  const url = new URL(`${entorno.API_URL}/api/v1/${destino}`);
  url.search = peticion.nextUrl.search;

  const cabeceras = new Headers();
  for (const nombre of CABECERAS_HACIA_EL_BACKEND) {
    const valor = peticion.headers.get(nombre);
    if (valor) cabeceras.set(nombre, valor);
  }
  cabeceras.set("Authorization", `Bearer ${token}`);

  const opciones: RequestInit = {
    method: peticion.method,
    headers: cabeceras,
    // Sin caché: toda respuesta lleva datos de un cliente concreto.
    cache: "no-store",
    // `manual`: una redirección del backend la decide el navegador,
    // no este proxy.
    redirect: "manual",
  };
  // Se asigna solo cuando hay cuerpo: con `exactOptionalPropertyTypes`,
  // poner `undefined` en una propiedad opcional no equivale a omitirla.
  if (METODOS_CON_CUERPO.has(peticion.method)) {
    opciones.body = await peticion.text();
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(url, opciones);
  } catch {
    // Backend caído o inalcanzable. El detalle va al log del
    // servidor, no al navegador.
    return NextResponse.json(
      { detail: "El servicio no esta disponible." },
      { status: 503 },
    );
  }

  const salida = new Headers();
  respuesta.headers.forEach((valor, nombre) => {
    if (!CABECERAS_A_DESCARTAR.has(nombre.toLowerCase())) {
      salida.set(nombre, valor);
    }
  });

  // Se devuelve el cuerpo como flujo, sin acumularlo: es lo que
  // mantiene vivo el SSE del progreso de un escaneo.
  return new Response(respuesta.body, {
    status: respuesta.status,
    headers: salida,
  });
}

function rutaPermitida(destino: string): boolean {
  if (destino.includes("..") || destino.startsWith("/")) return false;
  const primero = destino.split("/")[0] ?? "";
  return (PREFIJOS_PERMITIDOS as readonly string[]).includes(primero);
}

/**
 * Devuelve un access token vigente, refrescándolo si hace falta.
 *
 * Si el refresco falla, la sesión se destruye: arrastrarla con un
 * token muerto produciría un 401 en cada petición sin que el usuario
 * entienda por qué ni pueda salir del bucle.
 */
async function tokenValido(
  sesion: Awaited<ReturnType<typeof leerSesion>>,
): Promise<string | undefined> {
  if (tokenVigente(sesion)) return sesion.accessToken;
  if (!sesion.refreshToken) return undefined;

  try {
    const configuracion = await configuracionOidc();
    const tokens = await client.refreshTokenGrant(
      configuracion,
      sesion.refreshToken,
    );

    sesion.accessToken = tokens.access_token;
    // El proveedor puede rotar el refresh token; si no lo devuelve,
    // se conserva el anterior. Descartarlo dejaria la sesion muerta
    // al siguiente vencimiento.
    if (tokens.refresh_token) sesion.refreshToken = tokens.refresh_token;
    sesion.venceEn = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600);
    await sesion.save();

    return sesion.accessToken;
  } catch {
    sesion.destroy();
    return undefined;
  }
}

export const GET = manejar;
export const POST = manejar;
export const PATCH = manejar;
export const PUT = manejar;
export const DELETE = manejar;

// El SSE necesita ejecución dinámica: con la respuesta cacheada o
// prerenderizada no habría flujo que seguir.
export const dynamic = "force-dynamic";
