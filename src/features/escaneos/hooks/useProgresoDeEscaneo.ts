"use client";

/**
 * Progreso en vivo de un escaneo, por Server-Sent Events.
 *
 * Propósito
 *   Sustituir el polling del sistema de referencia, que preguntaba
 *   cada pocos segundos aunque no hubiera cambiado nada.
 *
 * Decisiones
 *   1. **`EventSource` y no WebSocket.** El flujo es de una sola
 *      dirección (servidor → navegador), va sobre HTTP normal y trae
 *      reconexión automática incorporada. Un WebSocket añadiría un
 *      protocolo y sesiones pegajosas en el balanceador a cambio de
 *      una capacidad que no se usa.
 *
 *   2. **Cierre explícito al terminar.** Sin él, `EventSource`
 *      reabre la conexión en cuanto el servidor la cierra, y un
 *      escaneo acabado dejaría una reconexión en bucle por cada
 *      pestaña abierta.
 *
 *   3. **Invalida la caché de TanStack Query al terminar.** El SSE
 *      trae el progreso, pero el listado de registros y el contador
 *      de revisión viven en otras consultas: sin invalidarlas, el
 *      usuario ve "completado" y una tabla vacía.
 *
 *   4. **Tope de reconexiones.** Si el backend está caído,
 *      `EventSource` reintentaría indefinidamente. Tras unos cuantos
 *      fallos se rinde y lo dice, en vez de dejar al usuario mirando
 *      una barra que no avanza.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ContadoresDeEscaneo {
  mensajes_revisados: number;
  mensajes_con_adjuntos: number;
  adjuntos_descargados: number;
  adjuntos_rechazados: number;
  adjuntos_duplicados: number;
  errores: number;
}

export interface ProgresoDeEscaneo {
  trabajo_id: string;
  estado: string;
  fase: string;
  progreso_porcentaje: number;
  contadores: ContadoresDeEscaneo;
  codigo_de_error?: string | null;
}

export type ConexionDeProgreso =
  | "conectando"
  | "en-vivo"
  | "terminado"
  | "desconectado";

const ESTADOS_TERMINALES = new Set([
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);

/**
 * Tope de reconexiones antes de rendirse.
 *
 * `EventSource` reintenta solo y sin límite; con el backend caído eso
 * son peticiones indefinidas desde cada pestaña abierta.
 */
const MAXIMO_DE_REINTENTOS = 5;

export function useProgresoDeEscaneo(
  trabajoId: string | undefined,
  { activo = true }: { activo?: boolean } = {},
) {
  const [progreso, setProgreso] = useState<ProgresoDeEscaneo | null>(null);
  const [conexion, setConexion] = useState<ConexionDeProgreso>("conectando");
  const reintentos = useRef(0);
  const clienteDeConsultas = useQueryClient();

  const alTerminar = useCallback(() => {
    // El progreso llega por SSE, pero los registros y el contador de
    // revisión son otras consultas: sin invalidarlas, la pantalla
    // diría "completado" sobre una tabla vacía.
    void clienteDeConsultas.invalidateQueries();
  }, [clienteDeConsultas]);

  useEffect(() => {
    if (!trabajoId || !activo) return;

    const fuente = new EventSource(`/api/bff/scans/${trabajoId}/stream`);
    let cerrado = false;

    const cerrar = (estado: ConexionDeProgreso) => {
      if (cerrado) return;
      cerrado = true;
      fuente.close();
      setConexion(estado);
    };

    fuente.addEventListener("open", () => {
      reintentos.current = 0;
      setConexion("en-vivo");
    });

    const procesar = (evento: MessageEvent<string>) => {
      try {
        const datos = JSON.parse(evento.data) as ProgresoDeEscaneo;
        setProgreso(datos);
        if (ESTADOS_TERMINALES.has(datos.estado)) {
          cerrar("terminado");
          alTerminar();
        }
      } catch {
        // Un evento malformado no debe tumbar la pantalla: se
        // descarta y se espera al siguiente, que trae el estado
        // completo de todas formas.
      }
    };

    fuente.addEventListener("estado", procesar as EventListener);
    fuente.addEventListener("progreso", procesar as EventListener);
    fuente.addEventListener("fin", () => {
      cerrar("terminado");
      alTerminar();
    });

    fuente.addEventListener("error", () => {
      // `EventSource` reconecta solo; aquí solo se cuenta y se corta
      // cuando insistir deja de tener sentido.
      reintentos.current += 1;
      if (reintentos.current > MAXIMO_DE_REINTENTOS) {
        cerrar("desconectado");
      } else {
        setConexion("conectando");
      }
    });

    return () => {
      cerrado = true;
      fuente.close();
    };
  }, [trabajoId, activo, alTerminar]);

  return { progreso, conexion };
}
