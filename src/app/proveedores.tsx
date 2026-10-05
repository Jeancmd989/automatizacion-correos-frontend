"use client";

/**
 * Proveedores de cliente de la aplicación.
 *
 * TanStack Query sustituye al hook de 350 líneas que el sistema de
 * referencia usaba para concentrar estado del servidor, polling,
 * OAuth y notificaciones. Caché, deduplicación, reintentos e
 * invalidación por mutación vienen resueltos.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

export function Proveedores({ children }: { children: ReactNode }) {
  // Dentro de `useState` y no a nivel de módulo: con una instancia
  // global, dos usuarios servidos por el mismo proceso compartirían
  // caché, y uno vería los datos del otro.
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Los datos de un escaneo cambian cada pocos segundos,
            // pero el progreso llega por SSE: no hace falta refrescar
            // al volver a la pestaña.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (intentos, error) => {
              // Un 401 o un 403 no mejoran reintentando: el token
              // caducó o falta permiso. Insistir solo retrasa el
              // mensaje que el usuario necesita ver.
              const estado = (error as { estado?: number }).estado;
              if (estado && estado >= 400 && estado < 500) return false;
              return intentos < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
}
