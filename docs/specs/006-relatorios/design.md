# Design — Relatórios

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Aprovada   |
| Atualizada em | 2026-06-26 |

> **Camada 3 — O DETALHE.**

## 1. Dados

Nenhuma mudança de schema. Lê `registros_ponto` (join `users`).

### `src/lib/relatorios/data.ts`

```ts
type ReportUserOption = { id: string; name: string; active: boolean };
listReportUsers(): Promise<ReportUserOption[]>            // todos, ordenados por nome

type ReportRow = {
  userId: string;
  name: string;
  hourlyRateCents: number | null;
  month: string;        // "YYYY-MM" (to_char(work_date,'YYYY-MM'))
  totalMinutes: number; // sum(worked_minutes)::int
};
reportByUserMonth(range: DateRange, userIds: string[]): Promise<ReportRow[]>
```

`reportByUserMonth`: `[]` se `userIds` vazio. Caso contrário:
`WHERE user_id IN (userIds) AND work_date BETWEEN range.from AND range.to`,
`GROUP BY user_id, users.name, users.hourly_rate_cents, to_char(work_date,'YYYY-MM')`.
`totalMinutes` coagido com `Number()`.

### `src/lib/relatorios/actions.ts`

```ts
fetchReport(range: DateRange, userIds: string[]): Promise<ReportRow[]>
```
`requirePermission("ponto:ver_equipe")` (RN-04). Sem permissão, redireciona.
Filtra `userIds` para strings não-vazias antes de consultar.

## 2. Cálculos (client)

- **Valor estimado (centavos)** por usuário = `round(minutes × rateCents ÷ 60)`
  (mesma fórmula dos KPIs do ponto). `rateCents == null` → valor `null` ("—"),
  fora do total de R$ (RN-01).
- **Data limite** de `AAAA-MM` = `new Date(AAAA, MM, 1)` → 1º do mês seguinte
  (índice de mês 0-based já aponta o próximo), formatado `dd/MM/yyyy` (RN-02).
- **Blocos por mês:** agrupa as `ReportRow` por `month` (ordem **cronológica
  crescente**); por mês: usuários ordenados por nome, total de minutos = soma,
  total de R$ = soma dos valores definidos.

## 3. Telas / UI

> Segue `docs/design-system.md`: segmented control de período (§6), KPIs em card
> (§6), tabela no desktop / cards no mobile (§6/§8), Modal (§6), tokens (§3).
> Abaixo só o específico.

### 3.1 `src/app/(app)/page.tsx` (Server)
Guarda `ponto:ver_equipe` (senão `redirect("/ponto")`); carrega `listReportUsers()`
e `todayISODate()`; renderiza `<RelatoriosView users today />`.

### 3.2 `RelatoriosView` (`src/app/(app)/relatorios-view.tsx`, client)
- Estado: `preset` (`week`|`month`|`custom`, default `month`), `customFrom/To`,
  `selectedIds` (default = ids dos **ativos**).
- `range` igual ao `PontoView`. React Query: key
  `["relatorios", range.from, range.to, [...selectedIds].sort()]`,
  `queryFn: fetchReport(range, selectedIds)`, `placeholderData: keepPreviousData`,
  `enabled: selectedIds.length > 0`.
- Cabeçalho: título **"Relatórios"**.
- Linha de filtros: segmented control (Semana/Mês/Intervalo) + `DateRangeField`
  (no custom) + `<UserMultiSelect>` (botão "Usuários (N)").
- Conteúdo: se nenhum usuário selecionado → aviso "Selecione ao menos um usuário".
  Senão, para cada **mês** (bloco):
  - Cabeçalho do bloco: rótulo do mês ("Junho de 2026") + "Data limite: 01/07/2026".
  - **KPIs (2):** Horas totais, Valor estimado (reusa o visual do card de KPI).
  - **Detalhamento por usuário:** tabela (`md:`) com Nome / Horas / Valor; no
    mobile, cards (uma coluna). Usuário sem valor/hora → Valor "—".
  - Vazio: "Nenhuma hora no período."

### 3.3 `UserMultiSelect` (`src/app/(app)/user-multiselect.tsx`, client)
- Props: `users: ReportUserOption[]`, `selectedIds: string[]`, `onChange(ids)`.
- Botão-gatilho: ícone + "Usuários (N)" (N = selecionados); abre `Modal`.
- No modal: **rascunho** local da seleção (não refaz a query a cada toque);
  lista de checkboxes (nome; inativos com tag "inativo"); ações **Marcar todos**
  / **Limpar**; rodapé **Cancelar** / **Aplicar** (Aplicar → `onChange(draft)` e fecha).
- Checkbox: `<input type="checkbox">` nativo (sem radix), alvo ≥ 44px na linha.

### 3.4 Menu (sidebar)
Item da home: rótulo **"Relatórios"**, ícone de gráfico (`BarChart3`), mesma
guarda de admin já usada. Rota continua `/`.

### 3.5 Exportação `.xlsx` (RF-08/09/10)

Sem lib de planilha (instalar trava no ambiente — ver memória), o `.xlsx` é
gerado **na mão** (OOXML), em módulos reutilizáveis:

- `src/lib/xlsx/zip.ts` — ZIP mínimo método **store** (CRC-32 próprio, sem deflate).
- `src/lib/xlsx/sheet.ts` — `buildXlsx(spec)`: uma planilha com estilos básicos
  (cabeçalho negrito, data `dd/mm/yyyy`, número `#,##0.00`) e `autoFilter`.
  Modelo de célula: `s` texto · `n` número · `d` data · `e` vazia.
- `src/lib/relatorios/data.ts` → `listEntriesForExport(range, userIds)`: entradas
  **não agregadas**, ordenadas por nome do usuário e depois data/criação.
- `src/lib/relatorios/export.ts` → `buildReportWorkbook(entries)`: monta as linhas
  (Usuário · Data · Título · Horas · Valor estimado · Descrição) e **um único
  total geral** ao fim, com fórmula `SUBTOTAL(9, D2:Dn)` / `SUBTOTAL(9, E2:En)`
  (recalcula com o filtro). O autofilter cobre só cabeçalho + dados (`A1:F{1+N}`),
  deixando a linha de total **fora** do range. Horas = min/60, valor = centavos/100 (RN-06).
- **Rota** `GET /api/relatorios/export?from&to&users` (`src/app/api/relatorios/export/route.ts`):
  guarda `ponto:ver_equipe` (RN-07), valida datas, busca entradas, gera o buffer e
  responde com `Content-Type` de xlsx + `Content-Disposition: attachment`.
- **UI:** botão "Exportar Excel" no cabeçalho de `RelatoriosView` que navega para a
  rota com o período e a seleção atuais; desabilitado sem usuários/sem dados.

## 4. Estado e autorização (CLAUDE.md §6, RN-04)
- Agregação: **Server Action** + **React Query** no client (filtros dinâmicos).
- Lista de usuários: estática, vem do Server Component (sem React Query).
- Autorização: `ponto:ver_equipe` no servidor (action e página).