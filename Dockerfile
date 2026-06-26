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

# Placeholder só para o BUILD: `src/db/index.ts` valida a presença de
# DATABASE_URL no import, e o `next build` carrega esses módulos. O postgres-js
# é lazy (não conecta sem query) e nenhuma página consulta o banco no build, então
# este valor nunca abre conexão. A URL REAL é injetada em runtime (compose).
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

# Cacheia .next/cache entre builds para acelerar rebuilds.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ------------------------------------------------------------
# Stage 3: ferramentas de banco (migrate / seed)
# Tem o código + node_modules COMPLETO (inclui drizzle-kit e tsx, que são
# devDependencies). Não roda build — é usado só por `docker compose run` para
# aplicar migrations e criar o admin. Ver `docker-compose.yml` e `seed.sh`.
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS tools
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Default: aplica as migrations pendentes (idempotente).
CMD ["npm", "run", "db:migrate"]

# ------------------------------------------------------------
# Stage 4: runtime mínimo
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
