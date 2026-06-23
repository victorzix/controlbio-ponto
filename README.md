# controlbio-ponto

Sistema de ponto eletrônico. **Next.js 16** (App Router) · **TypeScript** · **Drizzle ORM + PostgreSQL** · **Tailwind CSS v4 + shadcn/ui** · **motion**.

> Convenções, regras e fluxo de trabalho: veja [`CLAUDE.md`](./CLAUDE.md),
> [`docs/design-system.md`](./docs/design-system.md) e [`docs/specs/`](./docs/specs/).

## Pré-requisitos

- Node 22+
- Docker (para o PostgreSQL local)

## Começando

```bash
# 1. Variáveis de ambiente
cp .env.example .env      # ajuste os valores (DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*)

# 2. Dependências
npm install

# 3. Banco de dados
docker compose up -d db   # sobe o Postgres
npm run db:migrate        # aplica as migrations
npm run db:seed           # cria o admin inicial (SEED_ADMIN_* do .env)

# 4. Rodar
npm run dev               # http://localhost:3000  → redireciona para /login
```

Entre com o e-mail/senha definidos em `SEED_ADMIN_*`. **Troque a senha após o primeiro acesso.**

## Comandos

```bash
npm run dev           # desenvolvimento
npm run build         # build de produção
npm run lint          # eslint
npm test              # testes (vitest)

docker compose up -d db   # sobe só o Postgres
npm run db:generate   # gera migration a partir do schema
npm run db:migrate    # aplica migrations
npm run db:seed       # cria o admin inicial (idempotente)
npm run db:studio     # Drizzle Studio
```

## Estrutura

```
src/
  app/
    (auth)/login/      # tela pública de login
    (app)/             # área interna (protegida por sessão)
  components/ui/       # componentes shadcn/ui
  db/                  # schema, migrations, seed, conexão Drizzle
  lib/
    auth/              # hashing, sessão, getCurrentUser, server actions
    rbac.ts            # permissões por papel (RBAC em código)
  middleware.ts        # guarda otimista de rotas
docs/
  design-system.md     # paleta, tipografia, componentes, animações
  specs/               # especificações (spec → plan → design → tasks → acceptance)
```

## Autenticação

Sessão **no servidor** (tabela `sessions`) com cookie opaco `HttpOnly`; senha com `scrypt`
(`node:crypto`). Detalhes em [`docs/specs/001-autenticacao/`](./docs/specs/001-autenticacao/).
