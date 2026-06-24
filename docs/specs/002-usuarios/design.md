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

**Sem mudança de schema.** Reusa `users` (`id`, `name`, `email`, `passwordHash`, `role`, `active`,
`createdAt`, `updatedAt`). E-mail já é `unique`. `role` é o enum `user_role` (`admin`/`funcionario`).

## 3. Interfaces (servidor)

### `lib/auth/guard.ts`
```ts
requireUser(): Promise<SessionUser>            // redirect("/login") se anônimo
requirePermission(p: Permission): Promise<SessionUser> // requireUser + redirect("/") se !can(role,p)
```

### `lib/usuarios/data.ts`
```ts
listUsers(q?: string): Promise<UserListItem[]> // ordena por name; filtra name/email ILIKE %q%
getUserById(id: string): Promise<User | null>
// UserListItem = { id, name, email, role, active, createdAt } (NUNCA passwordHash)
```

### `lib/usuarios/actions.ts` (todas começam com `requirePermission`)
```ts
type ActionState = { error?: string; fieldErrors?: Record<string,string> }
createUser(prev, formData): Promise<ActionState>   // requirePermission("usuarios:criar")
updateUser(prev, formData): Promise<ActionState>   // requirePermission("usuarios:editar")
setUserActive(id: string, active: boolean): Promise<void> // requirePermission("usuarios:desativar")
```
- `createUser`: valida (zod), normaliza e-mail, checa duplicidade, `hashPassword`, insere. Sucesso →
  `redirect("/usuarios")`.
- `updateUser`: valida, checa duplicidade (excluindo o próprio id), aplica `name/email/role`; se senha
  preenchida (≥8) atualiza o hash. **RN-05:** se `id === currentUser.id`, ignora mudança de `role`
  (ou rejeita) e nunca permite desativar a si mesmo. Sucesso → `redirect("/usuarios")`.
- `setUserActive`: **RN-05** bloqueia desativar a própria conta; ao desativar, chama
  `invalidateAllSessions(id)` (RF-05). Opcional (questão §10): impedir desativar o último admin ativo.
- Violação de unicidade do banco (corrida) → tratada como erro de e-mail duplicado.

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

### `/usuarios` (lista)
- **Cabeçalho:** título "Usuários" + campo de busca (`Input`, submit por GET `?q=`) + botão "Novo
  usuário" (`Button`, **só admin**).
- **Mobile (base):** lista de **cards** — cada card: nome (negrito), e-mail (`text-muted-foreground`
  `text-sm`), `Badge` de papel e `Badge` de status (ativo=primary/secondary, inativo=outline/muted), e
  ações (Editar / Ativar-Desativar) **só para admin**, com alvos ≥ 44px.
- **`md:`+:** `Table` (shadcn) com colunas Nome · E-mail · Papel · Status · Ações.
- **Estados:** vazio ("Nenhum usuário encontrado."), com resultado, e destaque sutil para inativos
  (ex.: `opacity-70`).

### `/usuarios/novo` e `/usuarios/[id]` (form — componente `user-form.tsx`, client)
- `Card` `max-w-md` centralizado; campos empilhados (`gap-4`):
  - Nome (`Input`), E-mail (`Input type=email`), Papel (`<select>` nativo estilizado com as 3 opções),
    Senha (`Input type=password`; em **novo** obrigatória, em **edição** "deixe em branco para manter").
  - Em edição da **própria conta**: select de papel **desabilitado** + aviso curto (RN-05).
- Botão primário "Salvar" (`h-11 w-full` no mobile) + link "Cancelar" → `/usuarios`.
- Erros: mensagem por campo (`text-destructive text-sm`) e/ou erro geral.
- **Animação (motion):** entrada do Card com fade+`y` (igual ao login), respeitando `prefers-reduced-motion`.
- **Feedback:** `sonner` (toast) de sucesso ao voltar para a lista (via `?ok=criado|salvo|status`).

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
