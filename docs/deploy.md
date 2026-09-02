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

## Worker do ClickUp (spec 011)

O serviço `worker` consome a fila `clickup_sync_jobs` e fala com a API do ClickUp
(criar/atualizar tarefa, comentar, lançar tempo) para refletir o ponto batido no board
da sprint. A app **nunca** fala direto com o ClickUp — ela só grava o job na mesma
transação em que salva o ponto; quem processa é este serviço, sozinho e à parte.

- Roda a partir do estágio `tools` do `Dockerfile` — o mesmo do `migrate` (tem `tsx` e
  o código-fonte completo; o `runner` só tem o build standalone da app, sem isso).
- Comando: `npm run worker:clickup` (definido no `docker-compose.yml`).
- Acompanhar: `docker compose logs -f worker`.
- **Sem `CLICKUP_API_TOKEN`/`CLICKUP_TEAM_ID`**, o worker loga uma linha
  (`sem CLICKUP_API_TOKEN/CLICKUP_TEAM_ID — nada a fazer.`) e encerra **com sucesso**
  — não é uma falha. Como o serviço é `restart: unless-stopped`, o compose volta a
  subi-lo, então num ambiente sem token ele fica reiniciando e repetindo essa linha
  periodicamente; é inofensivo, mas se incomodar nos logs, pare-o com
  `docker compose stop worker`.
- Encerra de forma graciosa em `SIGTERM`/`SIGINT`: termina o **job em andamento** e para
  na fronteira do próximo, nunca no meio de uma etapa — é o que evita duplicar comentário
  ou lançamento de tempo num retry após um `docker compose down`/`restart worker`.
  Por isso o serviço declara `stop_grace_period: 60s`: a carência padrão do Docker (10s)
  é menor que o job mais caro (3 a 7 requisições no teto de 90/min) e viraria `SIGKILL`
  no meio do trabalho.
- **A garantia acima vale para uma parada com sinal.** Numa morte sem chance de encerrar
  (SIGKILL depois da carência, OOM, queda da máquina) o job fica marcado `running` no
  banco. Isso não o perde: `claimJobs` **retoma** job preso em `running` há mais de
  15 minutos, e ele recomeça da etapa gravada (`stage`), não do início — nada é
  duplicado. Na prática, um ponto pode ficar até ~15 minutos em "sincronizando" depois
  de uma queda dura antes de a fila voltar a andar sozinha.

### Variáveis de ambiente

| Variável                     | Papel                                                | Padrão |
| ----------------------------- | ----------------------------------------------------- | ------ |
| `CLICKUP_API_TOKEN`           | Token de serviço do workspace (`pk_...`)               | —      |
| `CLICKUP_TEAM_ID`              | Workspace (team) de destino                            | —      |
| `CLICKUP_TOKEN_ENC_KEY`        | Chave AES-256 (base64, 32 bytes) dos tokens pessoais   | —      |
| `CLICKUP_RATE_LIMIT_PER_MIN`   | Teto de requisições por minuto ao ClickUp              | `90`   |
| `CLICKUP_WORKER_POLL_MS`       | Intervalo de sondagem da fila                          | `5000` |
| `CLICKUP_MAX_ATTEMPTS`         | Tentativas automáticas antes de exigir reenvio manual  | `5`    |

Gere `CLICKUP_TOKEN_ENC_KEY` uma vez, antes da primeira subida:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### ⚠️ `CLICKUP_TOKEN_ENC_KEY` é segredo — trate como credencial de banco

Essa chave cifra o token pessoal de cada pessoa que conecta a própria conta do ClickUp
em **Minha conta → ClickUp**. **Perder essa chave (ou trocá-la sem migrar os dados)
invalida todos os tokens pessoais já armazenados** — os valores cifrados no banco ficam
indecifráveis para sempre, e **cada pessoa precisa reconectar** a própria conta. Guarde-a
com o mesmo cuidado que `POSTGRES_PASSWORD`: fora do controle de versão, com backup, e
nunca a rotacione sem um plano para o reonboarding de quem já conectou.

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