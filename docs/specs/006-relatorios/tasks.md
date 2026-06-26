# Tasks — Relatórios

| Campo         | Valor       |
| ------------- | ----------- |
| Status        | Em execução |
| Atualizada em | 2026-06-26  |

> **Camada 4 — A EXECUÇÃO.**

## Backend
- [x] **T-01:** `src/lib/relatorios/data.ts` — `listReportUsers()` e
      `reportByUserMonth(range, userIds)` (group by usuário + mês).
- [x] **T-02:** `src/lib/relatorios/actions.ts` — `fetchReport(range, userIds)`
      com `requirePermission("ponto:ver_equipe")`.

## Frontend
- [x] **T-03:** `src/app/(app)/user-multiselect.tsx` — seletor multi-usuário (Modal + rascunho).
- [x] **T-04:** `src/app/(app)/relatorios-view.tsx` — período + seleção + blocos por mês
      (KPIs, data limite, detalhamento por usuário).
- [x] **T-05:** `src/app/(app)/page.tsx` — guarda `ponto:ver_equipe` + render do relatório.
- [x] **T-06:** `src/components/app-sidebar.tsx` — item "Relatórios" (rótulo + ícone).

## Exportação xlsx
- [x] **T-10:** `src/lib/xlsx/{zip,sheet}.ts` — gerador de `.xlsx` na mão (zip store + OOXML).
- [x] **T-11:** `src/lib/relatorios/data.ts` `listEntriesForExport` + `export.ts`
      `buildReportWorkbook` (subtotal por usuário + total geral).
- [x] **T-12:** `src/app/api/relatorios/export/route.ts` — download guardado por `ponto:ver_equipe`.
- [x] **T-13:** Botão "Exportar Excel" em `relatorios-view.tsx`.

## Design system
- [x] **T-07:** `docs/design-system.md` — registrar o seletor multi-select (Modal) e o
      padrão de bloco-por-mês do relatório; bump de versão.

## Verificação
- [x] **T-08:** `tsc --noEmit` + `eslint src/**` sem erros.
- [x] **T-14:** Sanidade do `.xlsx` gerado (zip íntegro + XML válido, conferido via .NET ZipFile).
- [ ] **T-09:** Validar `acceptance.md` (humano).