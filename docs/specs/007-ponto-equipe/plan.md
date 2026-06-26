# Plan — Ponto: visão de equipe

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Aprovada   |
| Atualizada em | 2026-06-26 |

> **Camada 2 — A ESTRATÉGIA.**

## Abordagem

Estende a tela de ponto existente, reusando ao máximo. Duas frentes:

1. **Leitura multi-usuário (server).** Nova função de dados
   `listEntriesByUsers(userIds, range)` e action `fetchEntriesByUsers` guardada
   por `ponto:ver_equipe`, retornando as entradas com **nome e valor/hora do dono**.
   As actions de escrita ficam **inalteradas** (escopadas ao dono) — somente
   leitura por construção.

2. **UI condicional (client).** A `PontoView` ganha um seletor multi-usuário
   (reusa `user-multiselect.tsx` da spec 006), default `[meuId]`. Duas situações:
   - **Só eu** (`isOwnOnly`): caminho atual — query `["ponto"]` + CRUD + "Novo registro".
   - **Equipe** (inclui outros): query `["ponto-team"]`, render por usuário e
     **read-only** (passa `canEdit/Delete/Replicate = false`, esconde "Novo registro").

## Decisões

- **Dois caminhos de query** (própria × equipe), em vez de unificar: mantém a key
  `["ponto"]` no modo próprio para as mutações invalidarem corretamente, e isola a
  visão de equipe (read-only) numa key separada. Funcionário usa só a própria.
- **Read-only por construção:** não criamos action para mexer no ponto de outro.
  A UI só esconde os controles; o servidor jamais aceitaria, pois as actions são
  escopadas ao dono (`and(id, userId = session)`).
- **Reuso do seletor** (`UserMultiSelect`) e dos componentes de lista/KPIs. O
  `PontoKpis` passa a receber o **valor já calculado** (centavos), para somar
  vários usuários com valores/hora diferentes.
- **Agrupar por usuário** na visão de equipe: cada usuário vira uma seção (nome +
  total) e reusa a `PontoList` (data → título) já existente.

## Dependências

- Nenhuma dep nova. Reusa `user-multiselect`, `PontoList`, `PontoKpis`,
  `listReportUsers`, helpers de período.

## Riscos

- **Invalidação de cache:** resolvido mantendo o modo próprio na key `["ponto"]`.
- **Mistura de títulos entre usuários:** evitada agrupando **por usuário** antes
  do agrupamento por data/título (cada `PontoList` recebe só as entradas de um dono).