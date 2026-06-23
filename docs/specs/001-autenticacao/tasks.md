# Tasks — Autenticação

> **Camada 4 — A EXECUÇÃO.** Quebra do `design.md` em tarefas pequenas, ordenadas e
> verificáveis. Marque conforme avança. Cada tarefa deve caber idealmente em meio dia.

## Legenda

- `[ ]` pendente · `[~]` em andamento · `[x]` concluída
- Indique dependências com `(dep: T2)`.

## Tarefas

### Preparação
- [~] **T1** — Dependências: `zod`/`motion`/`clsx`/`tailwind-merge` já no `package.json`; componentes shadcn
      (`button input label card sonner`) já em `src/components/ui/`. **Falta instalar** os pacotes dos
      componentes (cva, lucide-react, sonner, @radix-ui/react-slot, @radix-ui/react-label) — ver README/handoff. · _ref: plan §3_
- [x] **T2** — Tema (tokens do design system) em `globals.css` + `layout.tsx` (`lang="pt-BR"`, metadata, Toaster). · _ref: design §5_ · _atende: RF-10_
- [x] **T3** — Tabela `sessions` em `schema.ts` + migration `0001` gerada e **aplicada** ao banco. · _ref: design §2_

### Núcleo de autenticação
- [x] **T4** — `src/lib/auth/password.ts`: `hashPassword`/`verifyPassword` com `scrypt` + `timingSafeEqual`. · _ref: design §7_ · _atende: RN-01_
- [x] **T5** — `src/lib/auth/session.ts`: `createSession`/`validateSession`/`invalidateSession`/`invalidateAllSessions`
      (token aleatório, SHA-256, expiração, limpeza preguiçosa). · _ref: design §3_ · _atende: RF-03, RN-04, RN-05_
- [x] **T6** — `src/lib/auth/index.ts`: `getCurrentUser()` (cookie → sessão → usuário ativo). · _ref: design §3_ · _atende: RN-02_
- [x] **T7** — `src/lib/auth/validation.ts`: schema `zod` do login + normalização de e-mail. · _ref: design §3/§6_ · _atende: RN-07_

### Fluxos e rotas
- [x] **T8** — `src/app` reorganizado em route groups `(auth)` e `(app)`; `page.tsx` template removido. · _ref: plan §2_
- [x] **T9** — `loginAction` (em `lib/auth/actions.ts`): valida, autentica, cria sessão, seta cookie, redireciona;
      mensagem genérica + dummy hash anti-enumeração. · _ref: design §3/§4/§6_ · _atende: RF-02, RF-04, RN-02, RN-03_
- [x] **T10** — `logoutAction`: revoga sessão + limpa cookie + redirect. · _ref: design §3_ · _atende: RF-05_
- [x] **T11** — `src/proxy.ts` (convenção Next 16; antigo `middleware.ts`): anônimo → `/login?redirectTo=...`; logado fora de `/login`. · _ref: design §1/§4_ · _atende: RF-06, RF-07, RF-08_
- [x] **T12** — `(app)/layout.tsx`: guarda autoritativa via `getCurrentUser()`. · _ref: design §4_ · _atende: RF-06_

### UI
- [x] **T13** — Tela `/login` mobile first (Card/Input/Label/Button), estados idle/enviando/erro, acessibilidade. · _ref: design §5_ · _atende: RF-01, RF-10_
- [x] **T14** — Animação `motion` na entrada do Card respeitando `prefers-reduced-motion`. · _ref: design §5, CLAUDE.md §3_
- [x] **T15** — Ação/botão de **logout** no header da área interna. · _atende: RF-05_

### Hardening (Should)
- [ ] **T16** — Rate limit de login por e-mail+IP (5/15min, contador em memória). · _ref: design §6_ · _atende: RF-09_

### Seed & dados
- [x] **T17** — `src/db/seed.ts`: admin inicial via env (idempotente) + `.env.example`/`.env` + script `db:seed`. · _ref: spec §10_

### Testes
- [x] **T18** — Unitários de `password` e `validation` (vitest). _Pendente:_ rodar após instalar `vitest`. (Testes de `session` dependem de banco — cobertos pela aceitação.)
- [ ] **T19** — Integração: `loginAction`/`logoutAction`/guarda de rota (depende de banco de teste; opcional neste ciclo).
- [ ] **T20** — Aceitação manual cobrindo CA-01..08 (preencher `acceptance.md`).
- [x] **T21** — `README.md`/`.env.example` atualizados.
- [ ] **T22** — Revisão (`/code-review`) e ajustes — após instalar deps e validar build.

## Definição de Pronto (DoD)

- [ ] Todos os critérios de aceitação (`spec.md` §9) verificados.
- [ ] Testes passando.
- [ ] Tela de login validada em viewport ~360px (CA-07).
- [ ] Code review aprovado.
- [ ] `README.md`/`.env.example` e a própria spec atualizados.

## Notas de Implementação

- **Hash de senha:** `scrypt` do `node:crypto` (sem dependência nativa), formato `scrypt$salt$hash`,
  N=2^16/r=8/p=1 e `maxmem` elevado para 192 MiB. Verificação em tempo constante.
- **Cookie name isolado:** `src/lib/auth/cookie.ts` separa `SESSION_COOKIE_NAME` do resto para a
  `middleware.ts` (edge) não importar o cliente Postgres.
- **Login sem react-hook-form:** o formulário usa `useActionState` + Server Action (mais simples e
  robusto com server actions). O componente `form.tsx` do shadcn foi **removido**; será re-adicionado
  quando uma feature precisar de formulários ricos.
- **`sonner.tsx` sem `next-themes`:** usa `theme="system"` direto, para não exigir um ThemeProvider e
  reduzir dependências.
- **Ambiente:** o `npm install` do shadcn travou (registry/TLS lento neste ambiente). Os arquivos foram
  escritos sem o CLI; restou ao operador rodar os installs manualmente (ver handoff).
- **`middleware.ts` → `proxy.ts`:** Next 16 deprecou o nome `middleware`; renomeado para `proxy.ts`
  com `export function proxy(...)` (mesma lógica). Sem isso o build emite aviso de depreciação.
- **`DATABASE_URL` sem `?schema=public`:** o sufixo é sintaxe do Prisma; o driver `postgres-js`
  repassava `schema` como parâmetro de conexão e o servidor recusava (FATAL 42704). Removido do
  `.env`/`.env.example`. (Antes disso o `drizzle-kit migrate` falhava silenciosamente — saía 0 sem
  aplicar nada.)
- **Docker / Postgres 18:** `docker-compose.yml` estava em `postgres:latest` (pulou para o major 18,
  que mudou o layout do diretório de dados e quebrou o volume → restart loop). Pinado em `postgres:18`
  e o mount movido de `/var/lib/postgresql/data` para `/var/lib/postgresql` (exigência do PG 18+).
- **Verificação executada (tudo verde):** `tsc --noEmit`, `npm run lint`, `npm test` (7/7),
  `npm run build`, `npm run db:migrate`, `npm run db:seed`. Smoke test em `next start`: `GET /`
  (anônimo) → 307 `/login?redirectTo=%2F`; `GET /login` → 200 com o formulário.
- **Ambiente:** o `npm install` do shadcn travou (registry/TLS lento). Os arquivos foram escritos
  sem o CLI; o operador rodou os installs manualmente.
- **Pendências (não-Must):** rate limit de login (T16, _Should_); testes de integração (T19);
  aceitação manual cobrindo CA-01..08 (T20); `/code-review` (T22).