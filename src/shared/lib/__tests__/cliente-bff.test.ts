/**
 * Tests del cliente del BFF.
 *
 * Verifican lo que de verdad importa de esta capa: que toda llamada va
 * al propio origen con la cookie de sesion, y que un error del backend
 * se traduce sin inventar ni filtrar nada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi, peticionAlBff, rutaDelBff } from "../cliente-bff";

function respuestaDe(
  cuerpo: unknown,
  { status = 200 }: { status?: number } = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("peticionAlBff", () => {
  it("llama al BFF del propio origen, nunca al backend", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaDe({ ok: true }));
    vi.stubGlobal("fetch", fetchFalso);

    await peticionAlBff("/scans");

    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/scans");
    // Una URL absoluta significaria que el navegador habla directamente
    // con el backend y necesitaria el token.
    expect(url.startsWith("http")).toBe(false);
    expect(opciones.credentials).toBe("same-origin");
  });

  it("no adjunta ninguna cabecera de autorizacion", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaDe({}));
    vi.stubGlobal("fetch", fetchFalso);

    await peticionAlBff("/me");

    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit];
    const cabeceras = JSON.stringify(opciones.headers ?? {}).toLowerCase();
    // El token lo añade el BFF en el servidor: si apareciera aqui,
    // estaria al alcance de cualquier XSS.
    expect(cabeceras).not.toContain("authorization");
  });

  it("devuelve el cuerpo cuando la respuesta es correcta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuestaDe({ data: { id: "abc" } })),
    );
    await expect(peticionAlBff("/scans/abc")).resolves.toEqual({
      data: { id: "abc" },
    });
  });

  it("resuelve sin cuerpo ante un 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaDe(null, { status: 204 })));
    await expect(peticionAlBff("/mailboxes/1")).resolves.toBeUndefined();
  });

  it("traduce un error RFC 9457 conservando el trace_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respuestaDe(
          {
            type: "urn:mailauto:error:limite-excedido",
            detail: "Se excedio el limite de solicitudes.",
            trace_id: "0af765",
          },
          { status: 429 },
        ),
      ),
    );

    const error = await peticionAlBff("/scans").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeApi);
    const api = error as ErrorDeApi;
    expect(api.estado).toBe(429);
    expect(api.codigo).toBe("urn:mailauto:error:limite-excedido");
    // El trace_id es lo que permite a soporte localizar la peticion.
    expect(api.traceId).toBe("0af765");
    expect(api.esReintentable).toBe(true);
  });

  it("no se rompe si el error no trae JSON valido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })),
    );

    const error = (await peticionAlBff("/scans").catch((e: unknown) => e)) as ErrorDeApi;
    expect(error).toBeInstanceOf(ErrorDeApi);
    expect(error.estado).toBe(502);
    expect(error.message).toBeTruthy();
  });

  it("marca como no reintentables los errores del cliente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuestaDe({ detail: "Sin permiso." }, { status: 403 })),
    );
    const error = (await peticionAlBff("/audit").catch((e: unknown) => e)) as ErrorDeApi;
    expect(error.esReintentable).toBe(false);
  });
});

describe("rutaDelBff", () => {
  // El cliente generado por orval reproduce las rutas del contrato, con
  // su prefijo de version. El BFF lo añade por su cuenta al reenviar, asi
  // que espera recibirlas sin el. Antes de normalizarlo aqui, cada
  // llamada generada llegaba como `/api/bff/api/v1/...`, cuyo primer
  // segmento es `api`: la allowlist del proxy la rechazaba con un 403 y
  // la interfaz entera se quedaba sin datos.
  it("quita el prefijo del contrato que el BFF vuelve a añadir", () => {
    expect(rutaDelBff("/api/v1/records")).toBe("/api/bff/records");
    expect(rutaDelBff("/api/v1/scans/abc/cancel")).toBe("/api/bff/scans/abc/cancel");
  });

  it("conserva la cadena de consulta", () => {
    expect(rutaDelBff("/api/v1/records?limite=25&ruc=20123456789")).toBe(
      "/api/bff/records?limite=25&ruc=20123456789",
    );
  });

  it("acepta rutas que ya vienen sin el prefijo", () => {
    expect(rutaDelBff("/scans")).toBe("/api/bff/scans");
  });

  it("no toca un segmento que solo empiece igual", () => {
    // `/api/v1beta` no es el prefijo: recortarlo dejaria una ruta
    // distinta de la que pidio el llamante.
    expect(rutaDelBff("/api/v1beta/records")).toBe("/api/bff/api/v1beta/records");
  });

  it("deja la ruta en el primer segmento permitido por el proxy", () => {
    // Lo que de verdad importa: el segmento que la allowlist del BFF
    // compara. Si no es uno de los suyos, la peticion muere en un 403.
    const permitidos = ["me", "mailboxes", "scans", "records", "review", "reports", "audit"];
    for (const ruta of [
      "/api/v1/me",
      "/api/v1/mailboxes",
      "/api/v1/scans",
      "/api/v1/records",
      "/api/v1/review/count",
      "/api/v1/reports/exports",
      "/api/v1/audit",
    ]) {
      const primero = rutaDelBff(ruta).replace("/api/bff/", "").split(/[/?]/)[0];
      expect(permitidos).toContain(primero);
    }
  });
});
