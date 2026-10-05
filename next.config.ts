import type { NextConfig } from "next";

/**
 * Configuracion de Next.js.
 *
 * Las cabeceras de seguridad se declaran aqui y no en un middleware
 * porque deben aplicarse tambien a los recursos estaticos, que el
 * middleware no intercepta.
 *
 * La CSP no lleva `unsafe-inline` en `script-src`: Next inyecta un nonce
 * por peticion y esa es toda la razon de prohibirlo. Dejar `unsafe-inline`
 * convierte la CSP en decorativa frente a un XSS.
 */
const cabecerasDeSeguridad = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // La cabecera `X-Powered-By` anuncia el framework y su version sin
  // aportar nada a un cliente legitimo.
  poweredByHeader: false,
  // Salida autocontenida: la imagen de produccion no necesita el
  // node_modules completo, solo lo que el build determina que se usa.
  output: "standalone",
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecerasDeSeguridad }];
  },
};

export default nextConfig;
