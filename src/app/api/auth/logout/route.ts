/**
 * Cierre de sesión.
 *
 * Destruye la cookie y, con ella, el único sitio donde vivía el
 * token. No se llama al endpoint de logout del proveedor a propósito:
 * cerrar sesión aquí no debe cerrarla en las demás aplicaciones que
 * el usuario tenga abiertas con la misma identidad.
 */

import { NextResponse } from "next/server";
import { entornoDeServidor } from "@/shared/config/entorno";
import { leerSesion } from "@/shared/lib/sesion";

export async function POST(): Promise<NextResponse> {
  const sesion = await leerSesion();
  sesion.destroy();
  return NextResponse.redirect(`${entornoDeServidor().APP_URL}/`, {
    status: 303,
  });
}
