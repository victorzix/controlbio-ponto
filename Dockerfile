# syntax=docker/dockerfile:1

# ============================================================
# controlbio-ponto — Next.js 16 (standalone) production image
# Baseado no exemplo oficial vercel/next.js/examples/with-docker
# ============================================================

# Atualize periodicamente para a última LTS do Node.
ARG NODE_VERSION=24.13.0-slim

# ------------------------------------------------------------
# Stage 1: dependências (cacheável)
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app

# Copia só os manifests primeiro para aproveitar o cache de layer.
COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ------------------------------------------------------------
# Stage 2: build da aplicação (output: standalone)
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Cacheia .next/cache entre builds para acelerar rebuilds.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ------------------------------------------------------------
# Stage 3: runtime mínimo
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Assets públicos
COPY --from=builder --chown=node:node /app/public ./public

# Permissão correta para o cache de prerender
RUN mkdir .next && chown node:node .next

# Output traces (imagem enxuta) — gerado por output: 'standalone'
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

# Healthcheck simples batendo na raiz
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
