import { entornoDeCliente } from "@/shared/config/entorno";

/**
 * Pagina inicial.
 *
 * Es un marcador de la Fase 0: la interfaz real (escaneos, registros,
 * revision, reportes) corresponde a la Fase 6 del plan de arquitectura.
 * Existe para que el andamiaje sea verificable de punta a punta: que el
 * build, el linting, el tipado y los tests pasen sobre algo que de
 * verdad se renderiza.
 */
export default function Inicio() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        {entornoDeCliente.NEXT_PUBLIC_APP_NAME}
      </h1>
      <p className="text-[var(--color-texto-tenue)]">
        Andamiaje del frontend. La interfaz de operacion se implementa en la
        Fase 6 del plan de arquitectura.
      </p>
      <dl className="grid gap-3 rounded-lg border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--color-texto-tenue)]">Estado</dt>
          <dd>Fase 0 — cimientos</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--color-texto-tenue)]">Sesion</dt>
          <dd>BFF con cookie httpOnly</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--color-texto-tenue)]">Cliente de API</dt>
          <dd>Generado desde el contrato OpenAPI</dd>
        </div>
      </dl>
    </div>
  );
}
