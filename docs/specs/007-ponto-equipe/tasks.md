# Tasks — Ponto: visão de equipe

| Campo         | Valor       |
| ------------- | ----------- |
| Status        | Em execução |
| Atualizada em | 2026-06-26  |

> **Camada 4 — A EXECUÇÃO.**

## Backend
- [x] **T-01:** `src/lib/ponto/data.ts` — `TeamEntry` + `listEntriesByUsers(userIds, range)`.
- [x] **T-02:** `src/lib/ponto/actions.ts` — `fetchEntriesByUsers` (guarda `ponto:ver_equipe`).

## Frontend
- [x] **T-03:** `ponto-kpis.tsx` — `PontoKpis` recebe `valueCents` calculado; exporta `estimateCents`.
- [x] **T-04:** `ponto-view.tsx` — seletor multi-usuário (admin), `isOwnOnly`,
      duas queries, `OwnContent` (CRUD) e `TeamContent` (read-only, por usuário).
- [x] **T-05:** `ponto/page.tsx` — `canVerEquipe` + `listReportUsers()` para o admin.

## Verificação
- [x] **T-06:** `tsc --noEmit` + `eslint src/**` sem erros.
- [ ] **T-07:** Validar `acceptance.md` (humano).