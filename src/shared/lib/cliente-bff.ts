/**
 * Cliente HTTP del navegador contra el BFF.
 *
 * Propósito
 *   Ser el único camino por el que el navegador habla con el backend,
 *   siempre a través de las rutas de este mismo origen.
 *
 * Decisión de diseño
 *   El navegador nunca recibe el access token. Las peticiones salen con
 *   la cookie de sesión `httpOnly` y es el BFF, en el servidor, quien
 *   añade la cabecera `Authorization`. Un XSS deja de poder robar
 *   credenciales de API: lo máximo que consigue es hacer peticiones
 *   desde la sesión abierta, que es un daño acotado y auditable.
 *
 *   Lo usa también el cliente generado por orval (ver `orval.config.ts`),
 *   de modo que ninguna llamada puede saltárselo por descuido.
 */

/** Error de una llamada al BFF, con el cuerpo RFC 9457 si vino. */
export class ErrorDeApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly traceId?: string,
  ) {
    super(mensaje);
    this.name = "ErrorDeApi";
  }

  /** `true` si reintentar tiene alguna posibilidad de funcionar. */
  get esReintentable(): boolean {
    return this.estado === 429 || this.estado >= 500;
  }
}

interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly trace_id?: string;
}

/** Prefijo de las rutas del BFF. Nunca se llama al backend directamente. */
const BASE = "/api/bff";

/**
 * Prefijo que el contrato OpenAPI lleva en cada ruta y que el BFF añade
 * por su cuenta al reenviar.
 */
const PREFIJO_DEL_CONTRATO = "/api/v1";

/**
 * Traduce una ruta del contrato a una ruta del BFF.
 *
 * El cliente generado reproduce las rutas tal como las publica el
 * backend, con su prefijo de versión; el proxy del BFF, en cambio, lo
 * añade él mismo y espera recibir la ruta sin él. Sin esta
 * normalización la petición llegaría como `/api/bff/api/v1/records`, su
 * primer segmento sería `api` y la allowlist de prefijos la rechazaría
 * con un 403: no una ruta rota, sino todas.
 *
 * Se normaliza aquí y no en el BFF a propósito. El mutator es el único
 * sitio que conoce el direccionamiento del BFF, y dejar que el proxy
 * acepte dos formas de la misma ruta debilitaría su allowlist, que es
 * precisamente lo que impide que sea un proxy abierto.
 */
export function rutaDelBff(ruta: string): string {
  const sinPrefijo = ruta.startsWith(`${PREFIJO_DEL_CONTRATO}/`)
    ? ruta.slice(PREFIJO_DEL_CONTRATO.length)
    : ruta;
  return `${BASE}${sinPrefijo}`;
}

export async function peticionAlBff<T>(
  ruta: string,
  opciones: RequestInit = {},
): Promise<T> {
  const respuesta = await fetch(rutaDelBff(ruta), {
    ...opciones,
    // `same-origin` basta: la cookie es de este mismo origen. Usar
    // `include` abriría el envío de credenciales a terceros orígenes.
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...opciones.headers,
    },
  });

  if (respuesta.status === 204) {
    return undefined as T;
  }

  if (!respuesta.ok) {
    throw await construirError(respuesta);
  }

  return (await respuesta.json()) as T;
}

async function construirError(respuesta: Response): Promise<ErrorDeApi> {
  let problema: ProblemDetails = {};
  try {
    problema = (await respuesta.json()) as ProblemDetails;
  } catch {
    // Una respuesta de error sin JSON válido (un 502 de un proxy, por
    // ejemplo) no debe provocar un segundo error que oculte el primero.
  }

  return new ErrorDeApi(
    respuesta.status,
    problema.type ?? "urn:mailauto:error:desconocido",
    // El mensaje del backend ya viene redactado para mostrarse: no se
    // inventa texto aquí ni se expone nada que no venga de él.
    problema.detail ?? problema.title ?? "No fue posible completar la operación.",
    problema.trace_id,
  );
}
