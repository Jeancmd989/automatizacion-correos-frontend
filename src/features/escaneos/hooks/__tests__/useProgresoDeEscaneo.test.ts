/**
 * Tests del hook de progreso en vivo.
 *
 * Verifican el comportamiento que no se ve mirando la pantalla: que
 * la conexión se cierre al terminar, que no reintente para siempre
 * cuando el backend está caído, y que invalide la caché para que el
 * listado de registros no se quede obsoleto.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgresoDeEscaneo } from "../useProgresoDeEscaneo";

/** Doble de `EventSource`: el entorno de pruebas no trae uno. */
class EventSourceFalso {
  static instancias: EventSourceFalso[] = [];

  readonly url: string;
  cerrado = false;
  private oyentes = new Map<string, Set<(evento: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    EventSourceFalso.instancias.push(this);
  }

  addEventListener(tipo: string, oyente: (evento: Event) => void): void {
    const conjunto = this.oyentes.get(tipo) ?? new Set();
    conjunto.add(oyente);
    this.oyentes.set(tipo, conjunto);
  }

  close(): void {
    this.cerrado = true;
  }

  /** Dispara un evento como lo haría el servidor. */
  emitir(tipo: string, datos?: unknown): void {
    const evento =
      datos === undefined
        ? new Event(tipo)
        : Object.assign(new Event(tipo), { data: JSON.stringify(datos) });
    for (const oyente of this.oyentes.get(tipo) ?? []) oyente(evento);
  }

  /** Emite una carga cruda, para simular lo que no es JSON válido. */
  emitirCrudo(tipo: string, carga: string): void {
    const evento = Object.assign(new Event(tipo), { data: carga });
    for (const oyente of this.oyentes.get(tipo) ?? []) oyente(evento);
  }
}

function progresoDe(estado: string, porcentaje = 50) {
  return {
    trabajo_id: "t1",
    estado,
    fase: "downloading",
    progreso_porcentaje: porcentaje,
    contadores: {
      mensajes_revisados: 3,
      mensajes_con_adjuntos: 2,
      adjuntos_descargados: 2,
      adjuntos_rechazados: 0,
      adjuntos_duplicados: 0,
      errores: 0,
    },
  };
}

function envoltorio(cliente: QueryClient) {
  // Nombre explícito: es un envoltorio de pruebas, no un componente de
  // la aplicación, pero el linter de React lo exige igual y un
  // componente anónimo en un stack trace no dice nada.
  const Envoltorio = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: cliente }, children);
  Envoltorio.displayName = "EnvoltorioDePruebas";
  return Envoltorio;
}

let cliente: QueryClient;

beforeEach(() => {
  EventSourceFalso.instancias = [];
  vi.stubGlobal("EventSource", EventSourceFalso);
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useProgresoDeEscaneo", () => {
  it("se conecta al stream del BFF, nunca al backend", () => {
    renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });

    const fuente = EventSourceFalso.instancias[0];
    expect(fuente?.url).toBe("/api/bff/scans/t1/stream");
  });

  it("no abre conexión sin identificador de trabajo", () => {
    renderHook(() => useProgresoDeEscaneo(undefined), {
      wrapper: envoltorio(cliente),
    });
    expect(EventSourceFalso.instancias).toHaveLength(0);
  });

  it("no abre conexión cuando está desactivado", () => {
    renderHook(() => useProgresoDeEscaneo("t1", { activo: false }), {
      wrapper: envoltorio(cliente),
    });
    expect(EventSourceFalso.instancias).toHaveLength(0);
  });

  it("expone el progreso que llega por el stream", async () => {
    const { result } = renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });

    act(() => {
      EventSourceFalso.instancias[0]?.emitir("open");
      EventSourceFalso.instancias[0]?.emitir("progreso", progresoDe("running", 40));
    });

    await waitFor(() => {
      expect(result.current.progreso?.progreso_porcentaje).toBe(40);
      expect(result.current.conexion).toBe("en-vivo");
    });
  });

  it("cierra la conexión al llegar a un estado terminal", async () => {
    const { result } = renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });
    const fuente = EventSourceFalso.instancias[0];

    act(() => {
      fuente?.emitir("progreso", progresoDe("succeeded", 100));
    });

    // Sin este cierre, `EventSource` reabriría la conexión en cuanto
    // el servidor la cerrara: un escaneo acabado dejaría una
    // reconexión en bucle por cada pestaña abierta.
    await waitFor(() => {
      expect(fuente?.cerrado).toBe(true);
      expect(result.current.conexion).toBe("terminado");
    });
  });

  it("invalida la caché al terminar", async () => {
    const invalidar = vi.spyOn(cliente, "invalidateQueries");
    renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });

    act(() => {
      EventSourceFalso.instancias[0]?.emitir("progreso", progresoDe("partial"));
    });

    // El SSE trae el progreso, pero los registros y el contador de
    // revisión son otras consultas: sin invalidarlas el usuario ve
    // "completado" sobre una tabla vacía.
    await waitFor(() => expect(invalidar).toHaveBeenCalled());
  });

  it("se rinde tras varios fallos en vez de reintentar sin fin", async () => {
    const { result } = renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });
    const fuente = EventSourceFalso.instancias[0];

    act(() => {
      for (let intento = 0; intento < 8; intento += 1) {
        fuente?.emitir("error");
      }
    });

    await waitFor(() => {
      expect(result.current.conexion).toBe("desconectado");
      expect(fuente?.cerrado).toBe(true);
    });
  });

  it("un evento malformado no tumba la pantalla", async () => {
    const { result } = renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });
    const fuente = EventSourceFalso.instancias[0];

    act(() => {
      fuente?.emitir("open");
      // JSON roto: el hook debe descartarlo sin lanzar.
      fuente?.emitirCrudo("progreso", "{no es json");
    });

    // Sigue sin progreso, pero vivo: no se cerró ni se rompió.
    expect(result.current.progreso).toBeNull();
    expect(fuente?.cerrado).toBe(false);

    act(() => {
      fuente?.emitir("progreso", progresoDe("running", 10));
    });

    await waitFor(() =>
      expect(result.current.progreso?.progreso_porcentaje).toBe(10),
    );
  });

  it("cierra la conexión al desmontar", () => {
    const { unmount } = renderHook(() => useProgresoDeEscaneo("t1"), {
      wrapper: envoltorio(cliente),
    });
    const fuente = EventSourceFalso.instancias[0];

    unmount();

    // Sin esto, navegar entre páginas deja una conexión abierta por
    // cada visita.
    expect(fuente?.cerrado).toBe(true);
  });
});
