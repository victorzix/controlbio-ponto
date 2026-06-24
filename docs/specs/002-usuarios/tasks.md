# Tasks — Usuários

> **Camada 4 — A EXECUÇÃO.** Marque conforme avança.

## Legenda
- `[ ]` pendente · `[~]` em andamento · `[x]` concluída · dependências `(dep: Tn)`.

## Tarefas

### Preparação / núcleo
- [x] **T1** — `src/lib/auth/guard.ts`: `requireUser()` e `requirePermission(p)` (server-side). · _atende: RF-06, RN-08_
- [x] **T2** — `src/lib/usuarios/validation.ts`: `createUserSchema`/`updateUserSchema` (zod; e-mail normalizado, senha ≥8, opcional na edição, papel ∈ enum). · _atende: RN-01..04_
- [x] **T3** — `src/lib/usuarios/data.ts`: `listUsers(q?)` (ILIKE) e `getUserById(id)` (sem `passwordHash`). · _atende: RF-01, RN-03_
- [x] **T4** — `src/lib/usuarios/actions.ts`: `createUser`/`updateUser`/`setUserActive` com `requirePermission`,
      duplicidade, hash, RN-05 e `invalidateAllSessions` ao desativar. · _atende: RF-02..05, RN-05, RN-07_

### UI — componentes
- [x] **T5** — `src/components/ui/table.tsx` (shadcn puro, escrito à mão). · _ref: design §5_
- [x] **T6** — `src/components/ui/badge.tsx` (shadcn puro; status/papel). · _atende: RF-09_

### UI — páginas
- [x] **T7** — `(app)/usuarios/page.tsx`: lista (cards no mobile, table no `md:`), busca `?q=`, "Novo" só p/ admin,
      badges, estado vazio. · _atende: RF-01, RF-07, RF-08, RF-09_
- [x] **T8** — `(app)/usuarios/user-form.tsx`: form com `<select>` nativo, `useActionState`, erros por campo,
      motion; papel desabilitado na própria conta. · _atende: RF-02, RF-03, RF-08, RN-05_
- [x] **T9** — `(app)/usuarios/novo/page.tsx`: guarda `usuarios:criar` + form criação. · _atende: RF-02_
- [x] **T10** — `(app)/usuarios/[id]/page.tsx`: guarda `usuarios:editar` + `getUserById` + form edição. · _atende: RF-03, RF-04_
- [x] **T11** — `(app)/layout.tsx`: nav com "Início"/"Usuários" (link condicionado a `usuarios:ler`). · _atende: RF-06_

### Feedback
- [x] **T12** — Toast de sucesso via `success-toast.tsx` lendo `?ok=criado|salvo|status`. · _atende: RF-10_

### Testes
- [x] **T13** — Unitários dos schemas (`validation.test.ts`): criar/editar, senha mínima/opcional, e-mail, papel.
- [ ] **T14** — Aceitação manual CA-01..10 (preencher `acceptance.md`).

### Finalização
- [x] **T15** — Verificação automática: `tsc --noEmit`, `lint`, `test` (15/15), `build` — todos verdes.
- [ ] **T16** — `/code-review` e ajustes.

## Definição de Pronto (DoD)
- [ ] CA-01..10 verificados.
- [ ] `tsc`/`lint`/`test`/`build` verdes.
- [ ] RBAC validado por papel (admin gerencia; funcionário negado).
- [ ] Telas ok em ~360px.

## Notas de Implementação

- **Sem dependências novas e sem migration** (reusa `users`). Componentes `table`/`badge` escritos à mão;
  papel via `<select>` nativo; formulários em páginas dedicadas (sem dialog).
- **Autorização no servidor** em toda página e action via `requirePermission` (`lib/auth/guard.ts`).
- **RN-05** aplicado no servidor: `updateUser` não altera o próprio papel; `setUserActive` não desativa a
  própria conta (e o botão de desativar não aparece para si mesmo na lista).
- **`setUserActive(id, active)`** é usada via `.bind(null, id, !active)` no `action` do form da lista.
- **`zod` v4:** `z.enum([...], { error: "..." })` (API do 4.x).
- **Verificação:** `tsc`/`lint`/`test` (15/15)/`build` verdes. Smoke test em `next start`: anônimo
  `/usuarios` → 307 `/login`; admin (sessão injetada) → 200 com a lista, "Novo usuário" e `/usuarios/novo` 200.
- **Pendências:** aceitação manual CA-01..10 (T14, inclui RBAC admin/funcionário e mobile) e `/code-review` (T16).
  Questão em aberto: bloquear desativar/rebaixar o **último admin** (spec §10).
