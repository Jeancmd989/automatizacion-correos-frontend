import type { Metadata, Viewport } from "next";
import { entornoDeCliente } from "@/shared/config/entorno";
import "./globals.css";

export const metadata: Metadata = {
  title: entornoDeCliente.NEXT_PUBLIC_APP_NAME,
  description:
    "Ingesta de adjuntos de correo y extraccion de datos tributarios.",
  // La aplicacion maneja datos fiscales: no debe aparecer en buscadores
  // ni dejar rastro en cachés de terceros.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        {/* Enlace de salto: primer elemento enfocable de la pagina, para
            que quien navega con teclado o lector de pantalla no tenga
            que recorrer el menu en cada vista (WCAG 2.4.1). */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-superficie)] focus:px-4 focus:py-2"
        >
          Saltar al contenido
        </a>
        <main id="contenido">{children}</main>
      </body>
    </html>
  );
}
