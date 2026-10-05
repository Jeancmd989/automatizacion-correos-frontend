"use client";

/**
 * Navegación principal del panel.
 *
 * Marca la sección activa con `aria-current`, no solo con color: a
 * quien navega con lector de pantalla el color no le dice nada, y a
 * quien no distingue bien los contrastes, tampoco.
 */

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

// Tipadas como `Route`: con `typedRoutes`, Next comprueba en
// compilacion que cada enlace apunta a una ruta que existe. Un typo
// deja de ser un 404 en produccion y pasa a ser un error de build.
const SECCIONES: readonly { ruta: Route; etiqueta: string }[] = [
  { ruta: "/escaneos", etiqueta: "Escaneos" },
  { ruta: "/revision", etiqueta: "Revisión" },
  { ruta: "/registros", etiqueta: "Registros" },
  { ruta: "/reportes", etiqueta: "Reportes" },
  { ruta: "/buzones", etiqueta: "Buzones" },
];

export function Navegacion({
  pendientes,
}: {
  pendientes?: number | undefined;
}) {
  const rutaActual = usePathname();

  return (
    <nav aria-label="Secciones" className="flex flex-wrap gap-1">
      {SECCIONES.map(({ ruta, etiqueta }) => {
        const activa = rutaActual === ruta;
        return (
          <Link
            key={ruta}
            href={ruta}
            aria-current={activa ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              activa
                ? "bg-[var(--color-acento)]/15 font-medium text-[var(--color-acento)]"
                : "text-[var(--color-texto-tenue)] hover:bg-[var(--color-superficie)]"
            }`}
          >
            {etiqueta}
            {ruta === "/revision" && pendientes !== undefined && pendientes > 0 && (
              <span
                className="ml-2 rounded-full bg-[var(--color-aviso)]/20 px-1.5 py-0.5 text-xs text-[var(--color-aviso)]"
                aria-label={`${pendientes} pendientes de revisión`}
              >
                {pendientes}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
