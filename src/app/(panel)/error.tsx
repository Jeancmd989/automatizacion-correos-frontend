"use client";

/**
 * Frontera de error del panel.
 *
 * Propósito
 *   Acotar el daño de un error de render a la sección donde ocurre, en
 *   lugar de dejar al usuario en la pantalla genérica de Next sin
 *   navegación ni forma de volver.
 *
 * Por qué hace falta
 *   Sin una frontera, cualquier excepción durante el render —un campo
 *   que el backend deja de enviar, una respuesta con una forma
 *   inesperada— tumba el árbol completo: desaparecen la cabecera, la
 *   navegación y el enlace para salir. El usuario no puede ni ir a otra
 *   sección. Con ella se conserva el layout y la pantalla rota se
 *   sustituye por un mensaje con la opción de reintentar.
 *
 *   No es una excusa para dejar de confiar en el contrato: un campo
 *   requerido que falta sigue siendo un error del backend y debe
 *   arreglarse allí. Lo que esto decide es cómo se degrada mientras
 *   ocurre.
 *
 * Decisión de diseño
 *   El mensaje no muestra el error. En producción Next ya lo redacta,
 *   pero además un texto de excepción puede arrastrar rutas internas o
 *   fragmentos de datos del tenant, y esta aplicación maneja
 *   información tributaria. Lo que se expone es el `digest`, que es
 *   justo lo que permite localizar el error en los logs sin revelar
 *   nada.
 */

import { useEffect } from "react";
import { Boton, Fallo } from "@/shared/ui";

export default function ErrorDeSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // La consola del navegador es donde lo verá quien reproduzca el
    // fallo; el envío a un recolector lo hace Next por su cuenta.
    console.error("error_de_seccion", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Esta sección no se pudo mostrar
      </h1>

      <Fallo
        mensaje="Ha ocurrido un error al cargar esta pantalla. El resto de la aplicación sigue disponible."
        onReintentar={reset}
      />

      {error.digest && (
        <p className="text-xs text-[var(--color-texto-tenue)]">
          Referencia para soporte: <code>{error.digest}</code>
        </p>
      )}

      <Boton variante="secundario" onClick={() => window.location.reload()}>
        Recargar la página
      </Boton>
    </div>
  );
}
