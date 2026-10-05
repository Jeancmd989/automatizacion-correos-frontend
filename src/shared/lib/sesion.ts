/**
 * Sesión del BFF: cookie cifrada, nunca accesible desde el navegador.
 *
 * Propósito
 *   Guardar el access token del lado servidor para que el navegador
 *   no lo vea nunca.
 *
 * Por qué una cookie cifrada y no un almacén en Redis
 *   La sesión contiene un token que el proveedor de identidad ya
 *   firma y caduca; no hay estado propio que coordinar entre
 *   réplicas. Un almacén añadiría infraestructura, un punto de fallo
 *   y latencia por petición a cambio de nada. Si algún día hiciera
 *   falta revocar sesiones al instante, ahí sí tocaría un almacén.
 *
 * Por qué `iron-session` y no cifrado propio
 *   Es el único sitio donde un error de criptografía se traduce en
 *   falsificación de sesiones. `iron-session` implementa el formato
 *   Iron (cifrado y firmado, con rotación de contraseña) y está
 *   mantenido al día. Las alternativas consideradas: escribir el
 *   AES-GCM a mano, que es reinventar plomería en el peor sitio
 *   posible; y Auth.js, mucho más pesado y con su propio modelo de
 *   proveedores que choca con el `audience` que esta API exige.
 */

import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { entornoDeServidor } from "@/shared/config/entorno";

/** Lo que guarda la sesión. Deliberadamente mínimo. */
export interface DatosDeSesion {
  /** Access token para el backend. Nunca sale de este proceso. */
  accessToken?: string;
  /** Refresh token, si el proveedor lo emitió. */
  refreshToken?: string;
  /** Epoch en segundos en que vence el access token. */
  venceEn?: number;
  /** `sub` del usuario. Solo para trazas; no es una credencial. */
  sub?: string;
  /** Correo, para mostrarlo en la cabecera. */
  email?: string;
  /** Espacio de trabajo activo, si el usuario pertenece a varios. */
  tenantId?: string;
}

/**
 * Margen con el que se considera vencido un token.
 *
 * Refrescar con antelación evita que una petición salga justo al
 * caducar y vuelva con un 401 que el usuario vería como un fallo.
 */
export const MARGEN_DE_VENCIMIENTO_SEGUNDOS = 60;

export function opcionesDeSesion(): SessionOptions {
  const entorno = entornoDeServidor();
  return {
    password: entorno.SESSION_SECRET,
    cookieName: "mailauto_sesion",
    cookieOptions: {
      // Lo esencial: inaccesible desde JavaScript. Un XSS deja de
      // poder robar la credencial de API.
      httpOnly: true,
      // En desarrollo sobre http, `secure` impediría que la cookie se
      // guardase siquiera.
      secure: entorno.NODE_ENV === "production",
      // `lax` y no `strict`: con `strict` la cookie no viaja en la
      // navegación de vuelta desde el proveedor de identidad y el
      // callback no encontraría la sesión.
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  };
}

export async function leerSesion() {
  const almacen = await cookies();
  return getIronSession<DatosDeSesion>(almacen, opcionesDeSesion());
}

export function tokenVigente(sesion: DatosDeSesion): boolean {
  if (!sesion.accessToken || !sesion.venceEn) return false;
  const ahora = Math.floor(Date.now() / 1000);
  return sesion.venceEn - ahora > MARGEN_DE_VENCIMIENTO_SEGUNDOS;
}
