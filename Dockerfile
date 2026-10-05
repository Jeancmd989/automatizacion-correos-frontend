# ─────────────────────────────────────────────────────────────────────
# Imagen de produccion del frontend.
#
# Tres etapas. La separacion entre `dependencias` y `constructor` no es
# cosmetica: mientras package-lock.json no cambie, Docker reutiliza la
# capa de instalacion y el build baja de minutos a segundos.
#
# La etapa final usa la salida `standalone` de Next: incluye solo los
# modulos que el build determina que se usan, en lugar del
# node_modules completo.
# ─────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts


FROM node:22-alpine AS constructor
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM node:22-alpine AS final
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Usuario sin privilegios: un proceso root dentro del contenedor
# convierte cualquier escape en un compromiso del host.
RUN addgroup --system --gid 10001 nodejs \
 && adduser --system --uid 10001 --ingroup nodejs nextjs

COPY --from=constructor --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=constructor --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=constructor --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
