# Design — Ponto: visão de equipe

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Aprovada   |
| Atualizada em | 2026-06-26 |

> **Camada 3 — O DETALHE.**

## 1. Dados (`src/lib/ponto/data.ts`)

Sem mudança de schema. Novo tipo e função:

```ts
type TeamEntry = PontoEntry & {
  userId: string;
  userName: string;
  hourlyRateCents: number | null;
};

listEntriesByUsers(userIds: string[], range: DateRange): Promise<TeamEntry[]>
```

Join `registros_ponto` + `users`, `WHERE user_id IN (userIds) AND work_date BETWEEN`,
ordenado por **nome do usuário**, depois **data desc** e `created_at desc`.
`[]` se `userIds` vazio.

## 2. Action (`src/lib/ponto/actions.ts`)

```ts
fetchEntriesByUsers(userIds: string[], range: DateRange): Promise<TeamEntry[]>
```
`requirePermission("ponto:ver_equipe")` (RN-01); sanea `userIds`. As actions de
escrita (`createEntry`/`updateEntry`/`deleteEntry`) **não mudam** — seguem
escopadas ao dono (RN-02).

## 3. UI (`src/app/(app)/ponto/`)

### `ponto-view.tsx`
Novas props: `canVerEquipe: boolean`, `users: ReportUserOption[]`.
Estado: `selectedIds` (default `[userId]`).

- `isOwnOnly = selectedIds.length === 1 && selectedIds[0] === userId`.
- `useOwn = !canVerEquipe || isOwnOnly`.
- **Seletor:** `<UserMultiSelect>` (reuso da spec 006) aparece só se `canVerEquipe`.
- **Queries:**
  - `ownQuery` (`["ponto", userId, from, to]`, `enabled: useOwn`) → `fetchOwnEntries`.
  - `teamQuery` (`["ponto-team", from, to, sortedIds]`,
    `enabled: canVerEquipe && !isOwnOnly && selectedIds.length>0`) → `fetchEntriesByUsers`.
- **Render:**
  - `useOwn` → `OwnContent`: KPIs (valor = `estimateCents(total, ownRate)`),
    `PontoList` com CRUD, "Novo registro" visível. Igual ao atual.
  - senão → `TeamContent`: agrupa por usuário (`buildUserSections`), KPIs somando
    horas e valor (por usuário, RN-04); para cada usuário, uma seção (nome + total)
    e uma `PontoList` **read-only** (`canEdit/Delete/Replicate=false`). Sem "Novo registro".
  - Título: "Meus registros" (own) / "Registros da equipe" (equipe).

### `ponto-kpis.tsx`
`PontoKpis` passa a receber `valueCents: number | null` (já calculado) + `hint?`.
Exporta `estimateCents` para reuso. (Antes calculava a partir de um único `rate`.)

### `page.tsx`
Calcula `canVerEquipe = can(role, "ponto:ver_equipe")`; se admin, carrega
`listReportUsers()` e passa para a `PontoView`.

## 4. Autorização (RN-01/02)
- Leitura de equipe: `ponto:ver_equipe` no servidor.
- Escrita: inalterada e escopada ao dono → impossível alterar ponto de terceiro,
  independentemente da UI ("somente leitura por construção").