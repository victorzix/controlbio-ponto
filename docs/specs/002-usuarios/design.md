# Design — Usuários

> **Camada 3 — O DETALHE TÉCNICO.** Planta baixa da implementação.

## 1. Arquitetura

```mermaid
flowchart TD
  subgraph UI["(app)/usuarios"]
    L[page.tsx — lista + busca]
    N[novo/page.tsx + user-form]
    E["[id]/page.tsx + user-form"]
  end
  G[lib/auth/guard.ts<br/>requirePermission]
  A[lib/usuarios/actions.ts]
  D[lib/usuarios/data.ts]
  RB[lib/rbac.ts — can()]
  AU[lib/auth — hashPassword / invalidateAllSessions / getCurrentUser]
  DB[(users)]

  L --> G --> RB
  L --> D --> DB
  N --> A
  E --> A
  A --> G
  A --> AU
  A --> DB
```

Leitura nas páginas (Server Components) via `data.ts`; escrita via Server Actions em `actions.ts`.
**Toda** página e ação chama `requirePermission(...)` antes de qualquer coisa.

## 2. Modelo de Dados

Reusa `users` (`id`, `name`, `username`, `email`, `passwordHash`, `role`, `active`, `createdAt`,
`updatedAt`). `role` é o enum `user_role` (`admin`/`funcionario`).

> **Atualizações:** o login passou a ser por `username` (spec 004) e o e-mail virou opcional. Em
> 2026-06-25 foi adicionada a coluna **`hourly_rate_cents`** (`integer`, nullable) — o **valor/hora** do
> usuário em centavos (form em reais → centavos na action). Migration aditiva (`0007`).

## 3. Interfaces (servidor)

### `lib/auth/guard.ts`
```ts
requireUser(): Promise<SessionUser>            // redirect("/login") se anônimo
requirePermission(p: Permission): Promise<SessionUser> // requireUser + redirect("/") se !can(role,p)
```

### `lib/usuarios/data.ts`
```ts
listUsers(q?: string): Promise<UserListItem[]> // ordena por name; filtra name/username/email ILIKE %q%
getUserById(id: string): Promise<UserEditData | null>
// UserListItem = { id, name, username, email, role, hourlyRateCents, active, createdAt } (NUNCA passwordHash)
```

### `lib/usuarios/actions.ts` (todas começam com `requirePermission`)
```ts
type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string,string> }
fetchUsers(q?): Promise<UserListItem[]>            // requirePermission("usuarios:ler") — leitura p/ React Query
createUser(input): Promise<ActionState>            // requirePermission("usuarios:criar")
updateUser(id, input): Promise<ActionState>        // requirePermission("usuarios:editar")
setUserActive(id, active): Promise<void>           // requirePermission("usuarios:desativar")
```
> **Atualização (2026-06-25):** os forms agora são **React Hook Form + Zod** e a navegação virou **SPA**.
> `createUser`/`updateUser` recebem o **objeto validado** (não `FormData`) e retornam `{ ok }` — **sem
> `redirect`**; o client fecha o modal e **invalida a query** `["usuarios"]` (React Query). `setUserActive`
> também não redireciona. `fetchUsers` é a leitura usada pela busca no client.

- `createUser`: valida (zod no servidor), normaliza e-mail, checa duplicidade de username/e-mail,
  converte valor/hora (reais→centavos), `hashPassword`, insere.
- `updateUser`: valida, checa duplicidade (excluindo o próprio id), aplica `name/username/email/hourlyRate`;
  se senha preenchida (≥8) atualiza o hash. **RN-05:** se `id === currentUser.id`, ignora mudança de `role`.
- `setUserActive`: **RN-05** bloqueia desativar a própria conta; ao desativar, `invalidateAllSessions(id)` (RF-05).
- Violação de unicidade do banco (corrida) → tratada como erro de username/e-mail duplicado.

## 4. Fluxos Principais

**Criar (CA-01/02/03):** admin abre `/usuarios/novo` → preenche → `createUser` valida, checa e-mail,
hash, insere → volta à lista com toast de sucesso. E-mail duplicado ou senha curta → erro no formulário.

**Editar papel (CA-04):** `/usuarios/[id]` pré-preenchido → muda papel → `updateUser` aplica. Se for a
própria conta, o campo papel vem **desabilitado** e a action ignora mudança (RN-05).

**Desativar/reativar (CA-05/06/07):** botão na lista/edição dispara `setUserActive(id, false|true)`.
Desativar a própria conta → bloqueado (botão ausente + guarda na action). Desativar outro → revoga
sessões; o alvo cai no login na próxima navegação (combina com o guard autoritativo do `(app)/layout`).

**RBAC (CA-08/09):** `requirePermission("usuarios:ler")` nas páginas (só **admin** possui); as actions
exigem `usuarios:criar/editar/desativar` (só admin) → URL direta de funcionário é negada no servidor.
Funcionário não tem `usuarios:ler` → redirect.

## 5. Telas / UI

> **Mobile first (CLAUDE.md §4)** + tokens/padrões de `docs/design-system.md` (§5).

### `/usuarios` (lista — `usuarios-client.tsx`, client/SPA)
- A página servidor só faz o guard (`usuarios:ler`) e renderiza o client com `currentUserId` + `isAdmin`.
- **Busca via React Query** (`CLAUDE.md` §6): input controlado em estado local (sem URL), **debounce**
  ~300ms → `useQuery(["usuarios", q], () => fetchUsers(q))` com `placeholderData: keepPreviousData`
  (sem flicker) e spinner de `isFetching`. **Não** usa `?q=` na URL.
- **Cabeçalho:** título "Usuários" + busca + botão "Novo usuário" (abre **modal**, só admin).
- **Mobile (base):** lista de **cards** — cada card: nome (negrito), `@username`, e-mail e **valor/hora**
  (quando houver) em `text-muted-foreground`, `Badge` de papel e `Badge` de status (ativo=primary/secondary,
  inativo=outline/muted), e ações (Editar / Ativar-Desativar) **só para admin**, com alvos ≥ 44px.
- **`md:`+:** `Table` (shadcn) com colunas Nome · Usuário · E-mail · Papel · **Valor/h** · Status · Ações.
  Valor/hora formatado em BRL (`Intl.NumberFormat pt-BR`), "—" quando ausente.
- **Estados:** vazio ("Nenhum usuário encontrado."), com resultado, e destaque sutil para inativos
  (ex.: `opacity-70`).

### Modal de usuário (criar/editar — `user-form.tsx`, client)
- Criar/editar acontecem em **`Modal`** na própria lista (não há mais rotas `/usuarios/novo` nem
  `/usuarios/[id]`). O modo `edit` reaproveita os dados do item já carregado na lista (sem novo fetch).
- **React Hook Form + Zod** (`CLAUDE.md` §7); campos (`gap-4`):
  - Nome (`Input`), Usuário/login (`Input`, sugerido do nome), E-mail (`Input type=email`, opcional),
    Papel (`<select>` via `<Controller>`), **Valor/hora** (`Input type=number step=0.01`, opcional, em R$),
    Senha (`Input type=password`; em **novo** obrigatória, em **edição** "deixe em branco para manter").
  - Em edição da **própria conta**: select de papel **desabilitado** + aviso curto (RN-05).
- Botões "Salvar" + "Cancelar" (fecha o modal). Erros por campo (`text-destructive text-sm`) + erro geral.
- **Feedback:** no sucesso, fecha o modal, **invalida** `["usuarios"]` (refetch) e dispara `sonner` (toast).
  Ativar/desativar é uma mutação que também invalida a query.

## 6. Validações & Tratamento de Erros

| Situação                         | Regra        | Resposta                                            |
| -------------------------------- | ------------ | --------------------------------------------------- |
| Nome vazio/curto                 | zod          | "Informe o nome." (campo)                           |
| E-mail inválido                  | zod          | "Informe um e-mail válido." (campo)                 |
| E-mail já usado por outro        | RN-01        | "Já existe um usuário com este e-mail." (campo)     |
| Senha < 8 (novo, ou edição c/ valor) | RN-02    | "A senha deve ter ao menos 8 caracteres." (campo)   |
| Papel inválido                   | RN-04        | "Papel inválido." (campo)                           |
| Desativar/rebaixar a si mesmo    | RN-05        | Ação bloqueada (botão ausente + erro se forçado)    |
| Escrita sem permissão            | RN-08        | `redirect("/")` (página) / erro negado (action)     |

## 7. Segurança & Privacidade

- Autorização no servidor em **toda** página e action (`requirePermission`). Esconder botões é só UX.
- `passwordHash` **nunca** sai das queries de leitura (selects explícitos sem o campo).
- Reuso do hashing forte do auth; senha nunca logada/retornada.
- Proteção contra auto-bloqueio (RN-05) e, opcionalmente, último admin (§10).
- Desativação revoga sessões (RF-05).

## 8. Observabilidade

- **Logs:** criação/edição/ativação-desativação (actor id, alvo id, campos alterados — **sem** senha).
- **Futuro:** trilha de auditoria persistida.

## 9. Mapa Spec → Design

| Requisito | Onde é atendido |
| --------- | --------------- |
| RF-01     | §3 `listUsers` + §5 lista/busca |
| RF-02     | §3 `createUser` + §5 form novo |
| RF-03     | §3 `updateUser` + §5 form edição |
| RF-04     | §3 `setUserActive` |
| RF-05/RN-07 | §3 `setUserActive` → `invalidateAllSessions` |
| RF-06/RN-08 | §3 `requirePermission` (páginas + actions) |
| RF-07     | §4/§5 botões de escrita só para admin |
| RF-08/CA-10 | §5 mobile first |
| RN-01     | §3 checagem de duplicidade + `unique` no banco |
| RN-02     | §3 senha (obrigatória no novo, opcional na edição) + §6 |
| RN-03     | §7 sem `passwordHash` nas leituras |
| RN-04     | §6 validação de papel |
| RN-05     | §3/§4 bloqueio de auto-desativação/rebaixamento |
