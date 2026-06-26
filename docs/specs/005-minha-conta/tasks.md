# Tasks — Minha conta

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Em execução|
| Atualizada em | 2026-06-26 |

> **Camada 4 — A EXECUÇÃO.** Ordem de implementação, marcável.

## Backend

- [x] **T-01:** `src/lib/conta/validation.ts` — `updateOwnAccountSchema`
      (name, username normalizado, email opcional, password opcional).
- [x] **T-02:** `src/lib/conta/actions.ts` — `updateOwnAccount(input)`:
      `requireUser`, parse, unicidade (username/email) ignorando o próprio,
      update + hash de senha condicional, mapeamento de violação UNIQUE.

## Frontend

- [x] **T-03:** `src/components/ui/avatar.tsx` — avatar de iniciais (puro, tokens).
- [x] **T-04:** `src/components/conta-form.tsx` — formulário RHF + Zod.
- [x] **T-05:** `src/components/conta-modal.tsx` — Modal + ContaForm + sucesso
      (`router.refresh()` + toast).
- [x] **T-06:** `src/components/app-sidebar.tsx` — prop `user`, controle de conta
      no rodapé (avatar + nome) abrindo o modal; rail/drawer; fechar drawer ao abrir.
- [x] **T-07:** `src/app/(app)/layout.tsx` — passar `user={{ name, username, email }}`.

## Design system

- [x] **T-08:** `docs/design-system.md` — registrar avatar e o controle de conta
      no rodapé da sidebar (§6/§9), bump de versão.

## Verificação

- [x] **T-09:** `npx tsc --noEmit` + `eslint src/**` sem erros.
- [ ] **T-10:** Validar `acceptance.md` (humano).