# Tasks — Login por primeiro nome

Ordem de execução. Marque conforme avança. Ref. [`design.md`](./design.md).

## Banco

- [x] T-01: Adicionar `username` (varchar 120, not null, unique) e tornar `email` nullable em `src/db/schema.ts`.
- [x] T-02: Gerar migration (`npm run db:generate`) e editar à mão p/ backfill seguro de `username`
  (nullable → `UPDATE ... lower(split_part(name,' ',1))` → `SET NOT NULL` + `ADD UNIQUE`) e `DROP NOT NULL` no email.
  → `src/db/migrations/0004_flippant_ghost_rider.sql`.
- [ ] T-03: Aplicar migration (`npm run db:migrate`). *(rodar manualmente — requer o Postgres no ar)*

## Núcleo

- [x] T-04: Criar `src/lib/auth/username.ts` com `deriveUsernameFromName` e `normalizeUsernameInput`.
- [x] T-05: `loginSchema` (email→username) em `src/lib/auth/validation.ts`.
- [x] T-06: `loginAction` busca por `username`; mensagem genérica "Usuário ou senha inválidos.".
- [x] T-07: `SessionUser` (+`username`, `email: string | null`) e `validateSession` em `session.ts`.

## Usuários

- [x] T-08: `createUserSchema`/`updateUserSchema` (+username, email opcional) em `usuarios/validation.ts`.
- [x] T-09: `createUser`/`updateUser` checam unicidade de `username` (e email se informado).
- [x] T-10: `data.ts` — tipos +username, email nullable, busca por nome/username/email.
- [x] T-11: `user-form.tsx` — campo Usuário com sugestão do nome; e-mail opcional.
- [x] T-12: `usuarios/page.tsx` — exibe `@username`, e-mail condicional, busca atualizada.

## Login UI

- [x] T-13: `login-form.tsx` — campo Usuário (text, sem autocapitalize/autocorrect).

## Seed

- [x] T-14: `seed.ts` — define `username` do admin (env `SEED_ADMIN_USERNAME` ou derivado do nome).

## Fechamento

- [x] T-15: `npm run lint` e checagem de tipos (`tsc --noEmit`) + testes (`npm test`, 34 ok).
- [x] T-16: Atualizar referência na spec 001 (RN-07/identificador de login).
- [ ] T-17: Validar `acceptance` (CA-01..05) manualmente.