"use client";

/**
 * Cola de revisión humana.
 *
 * Es lo que convierte la imperfección inevitable del OCR en un flujo
 * cerrado: el pipeline marca lo dudoso, una persona lo corrige y el
 * registro queda aprobado con constancia de quién lo tocó.
 *
 * Decisión de interfaz
 *   Los campos dudosos se resaltan y se ponen primero. Sin eso, quien
 *   revisa tiene que comparar el documento campo por campo, y una
 *   cola de revisión que cuesta dos minutos por registro no se usa.
 */

import { useState } from "react";
import {
  useRegistrosAprobarRegistro,
  useRegistrosColaDeRevision,
  useRegistrosCorregirRegistro,
  useRegistrosRechazarRegistro,
} from "@/generated/api/registros/registros";
import type { RegistroSalida } from "@/generated/model";
import {
  Boton,
  Cargando,
  Etiqueta,
  Fallo,
  SinDatos,
  Tarjeta,
} from "@/shared/ui";

/** Campos corregibles y su etiqueta, en el orden del formulario. */
const CAMPOS = [
  { clave: "ruc_contribuyente", etiqueta: "RUC del arrendador" },
  { clave: "nombre_contribuyente", etiqueta: "Nombre / Razón social" },
  { clave: "ruc_inquilino", etiqueta: "RUC del arrendatario" },
  { clave: "nombre_inquilino", etiqueta: "Inquilino" },
  { clave: "periodo", etiqueta: "Periodo (AAAAMM)" },
  { clave: "fecha_de_pago", etiqueta: "Fecha de pago (DD/MM/AAAA)" },
  { clave: "numero_de_operacion", etiqueta: "N.º de operación" },
  { clave: "importe", etiqueta: "Importe" },
] as const;

export function ColaDeRevision() {
  const cola = useRegistrosColaDeRevision({ limite: 25 });

  if (cola.isLoading) return <Cargando filas={5} />;

  if (cola.isError) {
    return (
      <Fallo
        mensaje="No fue posible cargar la cola de revisión."
        onReintentar={() => void cola.refetch()}
      />
    );
  }

  const registros = cola.data?.data ?? [];

  if (registros.length === 0) {
    return (
      <SinDatos
        titulo="No hay nada pendiente de revisar"
        descripcion="Los registros que el pipeline no pueda dar por buenos aparecerán aquí."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[var(--color-texto-tenue)]">
        {registros.length} registro{registros.length === 1 ? "" : "s"} pendiente
        {registros.length === 1 ? "" : "s"}. Los campos resaltados son los que
        el motor leyó con poca confianza.
      </p>
      {registros.map((registro) => (
        <FichaDeRevision
          key={registro.id}
          registro={registro}
          onResuelto={() => void cola.refetch()}
        />
      ))}
    </div>
  );
}

function FichaDeRevision({
  registro,
  onResuelto,
}: {
  registro: RegistroSalida;
  onResuelto: () => void;
}) {
  const dudosos = new Set(registro.campos_dudosos);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CAMPOS.map(({ clave }) => [
        clave,
        String(registro[clave as keyof RegistroSalida] ?? ""),
      ]),
    ),
  );

  const corregir = useRegistrosCorregirRegistro();
  const aprobar = useRegistrosAprobarRegistro();
  const rechazar = useRegistrosRechazarRegistro();

  const ocupado =
    corregir.isPending || aprobar.isPending || rechazar.isPending;
  const error = corregir.error ?? aprobar.error ?? rechazar.error;

  // Solo se envía lo que cambió. Mandar el formulario entero haría que
  // el backend marcase como "corregidos a mano" campos que nadie tocó,
  // y la confianza de todos subiría a 1.0 sin que nadie los mirase.
  const cambios = Object.fromEntries(
    CAMPOS.map(({ clave }) => [clave, valores[clave] ?? ""]).filter(
      ([clave, valor]) =>
        valor !== String(registro[clave as keyof RegistroSalida] ?? ""),
    ),
  );
  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = () => {
    if (!hayCambios) {
      aprobar.mutate({ registroId: registro.id }, { onSuccess: onResuelto });
      return;
    }
    corregir.mutate(
      { registroId: registro.id, data: { correcciones: cambios } },
      { onSuccess: onResuelto },
    );
  };

  return (
    <Tarjeta
      titulo={registro.ruc_contribuyente ?? "Sin RUC legible"}
      descripcion={`Leído por ${registro.estrategia_usada ?? "—"} · ${registro.completitud}`}
      acciones={
        <Etiqueta tono={dudosos.size > 0 ? "aviso" : "info"}>
          {dudosos.size > 0
            ? `${dudosos.size} campo${dudosos.size === 1 ? "" : "s"} dudoso${dudosos.size === 1 ? "" : "s"}`
            : "Revisión solicitada"}
        </Etiqueta>
      }
    >
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map(({ clave, etiqueta }) => {
            const dudoso = dudosos.has(clave);
            const confianza = registro.confianza_por_campo[clave];
            return (
              <label key={clave} className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-2">
                  {etiqueta}
                  {dudoso && (
                    <Etiqueta tono="aviso">
                      {confianza !== undefined
                        ? `${Math.round(confianza * 100)}%`
                        : "dudoso"}
                    </Etiqueta>
                  )}
                </span>
                <input
                  value={valores[clave] ?? ""}
                  onChange={(evento) =>
                    setValores((previos) => ({
                      ...previos,
                      [clave]: evento.target.value,
                    }))
                  }
                  // El borde marca el campo dudoso, pero la etiqueta de
                  // porcentaje de arriba es lo que lo comunica a quien
                  // no distingue el color.
                  className={`rounded-md border bg-[var(--color-fondo)] px-3 py-2 ${
                    dudoso
                      ? "border-[var(--color-aviso)]"
                      : "border-[var(--color-borde)]"
                  }`}
                />
              </label>
            );
          })}
        </div>

        {error && <Fallo mensaje={mensajeDeError(error)} />}

        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={ocupado}>
            {hayCambios ? "Guardar y aprobar" : "Aprobar sin cambios"}
          </Boton>
          <Boton
            type="button"
            variante="peligro"
            disabled={ocupado}
            onClick={() =>
              rechazar.mutate(
                { registroId: registro.id },
                { onSuccess: onResuelto },
              )
            }
          >
            Rechazar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible guardar la revisión.";
}
