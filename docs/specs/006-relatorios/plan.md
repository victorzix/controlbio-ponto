# Plan — Relatórios

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Aprovada   |
| Atualizada em | 2026-06-26 |

> **Camada 2 — A ESTRATÉGIA.**

## Abordagem

Reaproveita a arquitetura do `/ponto`: **Server Component** faz a guarda e
entrega os dados estáticos (lista de usuários selecionáveis); o **client** filtra
via **React Query** conforme período e seleção mudam.

1. **Repurpose da home `/`.** `page.tsx` deixa de saudar e passa a guardar por
   `ponto:ver_equipe` (funcionário → `/ponto`) e renderizar `RelatoriosView`.
   No menu, o item "Início" vira "Relatórios" (rótulo + ícone).

2. **Agregação no banco.** Nova camada `src/lib/relatorios/`:
   - `data.ts`: `listReportUsers()` (id, nome, ativo) e `reportByUserMonth(range, userIds)`
     com `GROUP BY usuário, to_char(work_date,'YYYY-MM')` somando minutos, e join em
     `users` para nome e valor/hora.
   - `actions.ts`: `fetchReport(range, userIds)` com `requirePermission("ponto:ver_equipe")`.

3. **UI client.** `RelatoriosView`: seletor de período (mesmo segmented control +
   `DateRangeField` do `/ponto`) + seletor multi-usuário; React Query busca a
   agregação; monta blocos por mês (totais + data limite + detalhamento por usuário).

## Decisões

- **Módulo `relatorios/` próprio** (não em `ponto/`): leitura de **equipe**
  (`ponto:ver_equipe`), agregada e multi-usuário — diferente do `ponto/` que é
  sempre escopado ao próprio dono (`ponto:ver_proprio`).
- **Agrupar por mês via SQL** (`to_char(work_date,'YYYY-MM')`) e calcular totais/
  data limite no client — agregação pesada fica no banco (RNF desempenho).
- **Seletor multi-usuário via `Modal`** (rascunho + "Aplicar") em vez de um
  dropdown radix (registry trava; design-system §6): evita refetch a cada toque e
  é confortável no mobile.
- **Valor estimado** reusa a fórmula dos KPIs do ponto (`min × rate ÷ 60`).
- **Sem React Query para a lista de usuários** (estática na sessão): vem do
  Server Component como prop; só a agregação é client (CLAUDE.md §6).

## Dependências

- Nenhuma dep npm nova. Reusa `Modal`, `DateRangeField`, segmented control,
  `getWeekRange`/`getMonthRange`, `todayISODate`, tokens e `formatWorkedMinutes`.
- Permissão `ponto:ver_equipe` já existe no RBAC.

## Riscos

- **Tipo do `SUM`** no Postgres (bigint → string): castar `::int` e coagir com
  `Number()` no JS para garantir número.
- **Período × mês desalinhados** (semana/intervalo dentro/entre meses): o group by
  mês resolve naturalmente, cada mês só soma os dias do range (RN-03).