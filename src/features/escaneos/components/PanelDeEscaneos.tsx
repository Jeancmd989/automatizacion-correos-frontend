"use client";

/**
 * Pantalla de escaneos: lanzar uno, seguirlo en vivo y ver el historial.
 *
 * Es la pantalla donde el SSE se nota: en el sistema de referencia
 * esto era un `setInterval` preguntando cada tres segundos aunque no
 * hubiera cambiado nada.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useEscaneosCancelar,
  useEscaneosIniciar,
  useEscaneosListar,
} from "@/generated/api/escaneos/escaneos";
import { useBuzonesListar } from "@/generated/api/buzones/buzones";
import type { EscaneoSalida } from "@/generated/model";
import {
  Boton,
  Cargando,
  Celda,
  Etiqueta,
  Fallo,
  Progreso,
  SinDatos,
  Tabla,
  Tarjeta,
} from "@/shared/ui";
import { useProgresoDeEscaneo } from "../hooks/useProgresoDeEscaneo";

const CABECERAS = [
  "Estado",
  "Fase",
  "Revisados",
  "Adjuntos",
  "Errores",
  "Encolado",
  "",
] as const;

const TONO_POR_ESTADO = {
  queued: "neutro",
  running: "info",
  succeeded: "exito",
  partial: "aviso",
  failed: "error",
  cancelled: "neutro",
} as const;

const TEXTO_POR_ESTADO: Record<string, string> = {
  queued: "En cola",
  running: "En curso",
  succeeded: "Completado",
  partial: "Con errores",
  failed: "Fallido",
  cancelled: "Cancelado",
};

const TEXTO_POR_FASE: Record<string, string> = {
  waiting: "En espera",
  authenticating: "Autenticando",
  listing: "Listando correos",
  downloading: "Descargando adjuntos",
  finalizing: "Finalizando",
  done: "Terminado",
};

export function PanelDeEscaneos() {
  const [enCurso, setEnCurso] = useState<string | undefined>();
  const router = useRouter();

  const buzones = useBuzonesListar();
  const escaneos = useEscaneosListar({ limite: 20 });
  const iniciar = useEscaneosIniciar();
  const cancelar = useEscaneosCancelar();

  const { progreso, conexion } = useProgresoDeEscaneo(enCurso, {
    activo: Boolean(enCurso),
  });

  const conexionesActivas =
    buzones.data?.data.filter((b) => b.estado === "active") ?? [];

  const lanzar = () => {
    const conexion = conexionesActivas[0];
    if (!conexion) return;
    iniciar.mutate(
      { data: { conexion_id: conexion.id, limite_de_mensajes: 200 } },
      {
        onSuccess: (respuesta) => {
          setEnCurso(respuesta.data.id);
          void escaneos.refetch();
        },
      },
    );
  };

  if (buzones.isLoading) return <Cargando filas={4} />;

  if (buzones.isError) {
    return (
      <Fallo
        mensaje="No fue posible cargar los buzones conectados."
        onReintentar={() => void buzones.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta
        titulo="Nuevo escaneo"
        descripcion={
          conexionesActivas.length > 0
            ? `Se revisarán los últimos correos de ${conexionesActivas[0]?.correo_de_la_cuenta}.`
            : undefined
        }
        acciones={
          conexionesActivas.length > 0 && (
            <Boton
              onClick={lanzar}
              cargando={iniciar.isPending}
              disabled={Boolean(enCurso) && conexion !== "terminado"}
            >
              Iniciar escaneo
            </Boton>
          )
        }
      >
        {conexionesActivas.length === 0 ? (
          <SinDatos
            titulo="No hay ningún buzón conectado"
            descripcion="Vincula una cuenta de Gmail o de Outlook para poder escanear."
            accion={
              <Boton
                variante="secundario"
                // Navegacion interna con el router: `window.location`
                // forzaria una recarga completa y tiraria la cache de
                // consultas por una transicion dentro de la propia app.
                onClick={() => router.push("/buzones")}
              >
                Ir a buzones
              </Boton>
            }
          />
        ) : (
          <ProgresoEnVivo progreso={progreso} conexion={conexion} />
        )}

        {iniciar.isError && (
          <div className="mt-4">
            <Fallo mensaje={mensajeDeError(iniciar.error)} />
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Historial">
        {escaneos.isLoading ? (
          <Cargando />
        ) : escaneos.isError ? (
          <Fallo
            mensaje="No fue posible cargar el historial."
            onReintentar={() => void escaneos.refetch()}
          />
        ) : (escaneos.data?.data ?? []).length === 0 ? (
          <SinDatos
            titulo="Todavía no se ha lanzado ningún escaneo"
            descripcion="Al terminar el primero, aquí aparecerá su resultado."
          />
        ) : (
          <Tabla cabeceras={CABECERAS} descripcion="Historial de escaneos">
            {(escaneos.data?.data ?? []).map((escaneo) => (
              <FilaDeEscaneo
                key={escaneo.id}
                escaneo={escaneo}
                onSeguir={() => setEnCurso(escaneo.id)}
                onCancelar={() =>
                  cancelar.mutate(
                    { trabajoId: escaneo.id },
                    { onSuccess: () => void escaneos.refetch() },
                  )
                }
              />
            ))}
          </Tabla>
        )}
      </Tarjeta>
    </div>
  );
}

function ProgresoEnVivo({
  progreso,
  conexion,
}: {
  progreso: ReturnType<typeof useProgresoDeEscaneo>["progreso"];
  conexion: ReturnType<typeof useProgresoDeEscaneo>["conexion"];
}) {
  if (!progreso) {
    return (
      <p className="text-sm text-[var(--color-texto-tenue)]">
        Ningún escaneo en curso.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{TEXTO_POR_FASE[progreso.fase] ?? progreso.fase}</span>
        <span className="text-[var(--color-texto-tenue)]">
          {progreso.progreso_porcentaje}%
        </span>
      </div>

      <Progreso
        porcentaje={progreso.progreso_porcentaje}
        etiqueta="Progreso del escaneo"
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Contador etiqueta="Correos" valor={progreso.contadores.mensajes_revisados} />
        <Contador etiqueta="Adjuntos" valor={progreso.contadores.adjuntos_descargados} />
        <Contador etiqueta="Duplicados" valor={progreso.contadores.adjuntos_duplicados} />
        <Contador etiqueta="Errores" valor={progreso.contadores.errores} />
      </dl>

      {conexion === "desconectado" && (
        <p className="text-sm text-[var(--color-aviso)]">
          Se perdió la conexión en vivo. El escaneo sigue en marcha; recarga
          para ver su estado.
        </p>
      )}
    </div>
  );
}

function Contador({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2 sm:flex-col sm:gap-0">
      <dt className="text-[var(--color-texto-tenue)]">{etiqueta}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

function FilaDeEscaneo({
  escaneo,
  onSeguir,
  onCancelar,
}: {
  escaneo: EscaneoSalida;
  onSeguir: () => void;
  onCancelar: () => void;
}) {
  const activo = escaneo.estado === "queued" || escaneo.estado === "running";
  const tono = TONO_POR_ESTADO[escaneo.estado as keyof typeof TONO_POR_ESTADO];

  return (
    <tr className="border-b border-[var(--color-borde)] last:border-0">
      <Celda>
        <Etiqueta tono={tono ?? "neutro"}>
          {TEXTO_POR_ESTADO[escaneo.estado] ?? escaneo.estado}
        </Etiqueta>
      </Celda>
      <Celda>{TEXTO_POR_FASE[escaneo.fase] ?? escaneo.fase}</Celda>
      <Celda className="tabular-nums">
        {escaneo.contadores.mensajes_revisados}
      </Celda>
      <Celda className="tabular-nums">
        {escaneo.contadores.adjuntos_descargados}
      </Celda>
      <Celda className="tabular-nums">{escaneo.contadores.errores}</Celda>
      <Celda className="whitespace-nowrap text-[var(--color-texto-tenue)]">
        {new Date(escaneo.encolado_en).toLocaleString("es-PE")}
      </Celda>
      <Celda>
        {activo ? (
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={onSeguir}>
              Seguir
            </Boton>
            <Boton variante="peligro" onClick={onCancelar}>
              Cancelar
            </Boton>
          </div>
        ) : null}
      </Celda>
    </tr>
  );
}

function mensajeDeError(error: unknown): string {
  // El backend ya devuelve un mensaje redactado para mostrarse; aquí
  // no se inventa texto ni se expone nada que no venga de él.
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible iniciar el escaneo.";
}
