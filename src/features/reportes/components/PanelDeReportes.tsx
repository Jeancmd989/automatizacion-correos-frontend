"use client";

/**
 * Solicitud y descarga de reportes.
 *
 * La exportación es asíncrona: el backend responde 202 con un
 * identificador y el fichero se genera en un worker. Aquí se consulta
 * el estado hasta que está listo y entonces aparece el enlace.
 *
 * Decisión
 *   El sondeo se detiene en cuanto la exportación llega a un estado
 *   terminal. Un intervalo que sigue corriendo después de terminar es
 *   la forma más fácil de dejar peticiones en bucle en una pestaña
 *   olvidada.
 */

import { useState } from "react";
import {
  useRegistrosConsultarExportacion,
  useRegistrosSolicitarExportacion,
} from "@/generated/api/registros/registros";
import { Boton, Etiqueta, Fallo, Tarjeta } from "@/shared/ui";

const FORMATOS = [
  { valor: "xlsx", etiqueta: "Excel (.xlsx)" },
  { valor: "csv", etiqueta: "CSV" },
] as const;

const ESTADOS_TERMINALES = new Set(["ready", "failed"]);

const TEXTO_POR_ESTADO: Record<string, string> = {
  queued: "En cola",
  running: "Generando",
  ready: "Listo",
  failed: "Falló",
};

export function PanelDeReportes() {
  const [formato, setFormato] = useState<string>("xlsx");
  const [ruc, setRuc] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [exportacionId, setExportacionId] = useState<string | undefined>();

  const solicitar = useRegistrosSolicitarExportacion();

  const exportacion = useRegistrosConsultarExportacion(exportacionId ?? "", {
    query: {
      enabled: Boolean(exportacionId),
      // Se consulta cada dos segundos mientras se genera y se deja de
      // consultar en cuanto termina.
      refetchInterval: (consulta) => {
        const estado = consulta.state.data?.data.estado;
        return estado && ESTADOS_TERMINALES.has(estado) ? false : 2000;
      },
    },
  });

  const datos = exportacion.data?.data;

  const pedir = () => {
    solicitar.mutate(
      {
        data: {
          formato,
          ...(ruc ? { ruc } : {}),
          ...(periodo ? { periodo } : {}),
        },
      },
      { onSuccess: (respuesta) => setExportacionId(respuesta.data.id) },
    );
  };

  return (
    <Tarjeta
      titulo="Exportar registros"
      descripcion="El reporte se genera en segundo plano; el enlace de descarga caduca a los cinco minutos."
    >
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          pedir();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-texto-tenue)]">Formato</span>
            <select
              value={formato}
              onChange={(evento) => setFormato(evento.target.value)}
              className="rounded-md border border-[var(--color-borde)] bg-[var(--color-fondo)] px-3 py-2"
            >
              {FORMATOS.map(({ valor, etiqueta }) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-texto-tenue)]">RUC (opcional)</span>
            <input
              value={ruc}
              onChange={(evento) => setRuc(evento.target.value)}
              inputMode="numeric"
              maxLength={11}
              className="w-36 rounded-md border border-[var(--color-borde)] bg-[var(--color-fondo)] px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--color-texto-tenue)]">
              Periodo (opcional)
            </span>
            <input
              value={periodo}
              onChange={(evento) => setPeriodo(evento.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="AAAAMM"
              className="w-32 rounded-md border border-[var(--color-borde)] bg-[var(--color-fondo)] px-3 py-2"
            />
          </label>

          <Boton type="submit" cargando={solicitar.isPending}>
            Generar
          </Boton>
        </div>

        {solicitar.isError && <Fallo mensaje={mensajeDeError(solicitar.error)} />}

        {datos && (
          <div
            // `aria-live`: el estado cambia solo, sin que el usuario
            // haga nada, así que hay que anunciarlo.
            aria-live="polite"
            className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-borde)] p-4 text-sm"
          >
            <Etiqueta
              tono={
                datos.estado === "ready"
                  ? "exito"
                  : datos.estado === "failed"
                    ? "error"
                    : "info"
              }
            >
              {TEXTO_POR_ESTADO[datos.estado] ?? datos.estado}
            </Etiqueta>

            {datos.estado === "ready" && (
              <>
                <span className="text-[var(--color-texto-tenue)]">
                  {datos.total_filas} fila{datos.total_filas === 1 ? "" : "s"}
                </span>
                {datos.url_de_descarga && (
                  <a
                    href={datos.url_de_descarga}
                    // `noreferrer` además de `noopener`: la URL
                    // prefirmada no debe viajar en el `Referer` al
                    // almacenamiento.
                    rel="noopener noreferrer"
                    className="rounded-md bg-[var(--color-acento)] px-3 py-1.5 text-white"
                  >
                    Descargar
                  </a>
                )}
              </>
            )}

            {datos.estado === "failed" && (
              <span>{datos.mensaje_de_error ?? "No se pudo generar."}</span>
            )}
          </div>
        )}
      </form>
    </Tarjeta>
  );
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible solicitar el reporte.";
}
