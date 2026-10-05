/**
 * Disposición del panel: cabecera, navegación y contenido.
 *
 * Es un Server Component y comprueba la sesión antes de renderizar.
 * Hacerlo aquí y no en cada página garantiza que ninguna sección
 * nueva se olvide de la comprobación: lo que protege es la carpeta,
 * no la pantalla.
 */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { entornoDeCliente } from "@/shared/config/entorno";
import { leerSesion } from "@/shared/lib/sesion";
import { Navegacion } from "@/shared/ui/navegacion";
import { Proveedores } from "@/app/proveedores";

export default async function DisposicionDelPanel({
  children,
}: {
  children: ReactNode;
}) {
  const sesion = await leerSesion();
  if (!sesion.accessToken) {
    redirect("/");
  }

  return (
    <Proveedores>
      <div className="min-h-dvh">
        <header className="border-b border-[var(--color-borde)] bg-[var(--color-superficie)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
            <span className="font-semibold">
              {entornoDeCliente.NEXT_PUBLIC_APP_NAME}
            </span>
            <Navegacion />
            <div className="flex items-center gap-3 text-sm">
              {sesion.email && (
                <span className="text-[var(--color-texto-tenue)]">
                  {sesion.email}
                </span>
              )}
              {/* Formulario y no enlace: cerrar sesión cambia estado y
                  no debe poder dispararse con una precarga o un
                  rastreador siguiendo un GET. */}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-[var(--color-borde)] px-3 py-1.5 text-sm hover:bg-[var(--color-fondo)]"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </div>
    </Proveedores>
  );
}
