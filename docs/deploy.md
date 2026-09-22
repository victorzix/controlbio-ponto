# Deploy na VPS (Docker)

Sobe **app + Postgres + migrações** com Docker Compose. Cenário documentado:
**HTTP direto, sem TLS** (ver ⚠️ no fim — recomendado pôr um proxy HTTPS depois).

## Pré-requisitos na VPS

- Docker + plugin Docker Compose (`docker compose version`).
- Porta da app liberada no firewall (padrão `3000`, ajustável via `APP_PORT`).
- **Não** abra a porta do Postgres na internet (o compose já a prende em `127.0.0.1`).

## Passo a passo

```bash
# 1. Código
git clone <repo> controlbio-ponto && cd controlbio-ponto

# 2. Configuração
cp .env.example .env
#   Edite o .env e ajuste no MÍNIMO:
#     POSTGRES_PASSWORD = senha forte do banco
#     NODE_ENV=production
#     SESSION_COOKIE_SECURE=false      (porque é HTTP sem TLS)
#     APP_PORT=3000                    (porta pública desejada)

# 3. Build + sobe (banco → migrações → app). As migrações rodam sozinhas e são idempotentes.
docker compose up -d --build

# 4. Cria o admin inicial (1x). Use uma senha com >= 8 caracteres.
./seed.sh -p "SuaSenhaForte" -n "Seu Nome" -u seuusuario
#   (se faltar permissão de execução: `bash seed.sh -p ...`)

# 5. Acesse http://SEU_IP:3000  → login com o usuário/senha do seed → troque a senha em "Minha conta".
```

## Operação

```bash
docker compose logs -f app          # logs da app
docker compose ps                   # status
docker compose down                 # derruba (mantém os dados)
```

### Atualizar (nova versão)

```bash
git pull
docker compose up -d --build        # rebuilda; migrações pendentes rodam de novo (idempotente)
```

### Backup do banco

```bash
# Dump lógico
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql
# Os dados ficam no volume `postgres_data` (sobrevive a `down`; some com `down -v`).
```

## Notas

- A app fala com o banco pelo host interno `db` (rede do compose). O `DATABASE_URL`
  dos serviços `app`/`migrate` é montado no `docker-compose.yml` — **sem**
  `?schema=public` (o `postgres-js` rejeita essa sintaxe do Prisma).
- O serviço `migrate` usa o estágio `tools` do Dockerfile (tem `drizzle-kit`/`tsx`).
  É o mesmo que o `seed.sh` reaproveita para criar o admin.
- O `seed` é **idempotente**: rodar de novo com um usuário já existente não faz nada.

## ⚠️ Sem TLS

Com HTTP puro, **senha e cookie de sessão trafegam em texto puro** e podem ser
capturados na rede. `SESSION_COOKIE_SECURE=false` é necessário para o login
funcionar nesse modo. Assim que possível, coloque um proxy TLS (Caddy/nginx/
Traefik) na frente e volte `SESSION_COOKIE_SECURE` para `true`.