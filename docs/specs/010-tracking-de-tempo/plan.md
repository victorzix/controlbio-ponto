# Plan — Tracking de Tempo (Cronômetro de Ponto)

> **Camada 2 — A ESTRATÉGIA TÉCNICA.** Como atacar os requisitos da `spec.md`.

## 1. Visão Geral da Abordagem

Um **rascunho persistido no banco** (`time_trackings`) com **N segmentos** (`time_tracking_segments`),
cada um com `started_at`/`ended_at`. O **tempo é sempre derivado dos timestamps no servidor** — o cliente
só exibe um relógio que "anda" localmente a partir do momento em que os dados chegaram (sem ser fonte da
verdade). Play/pause/stop/ajuste/finalizar/descartar são **Server Actions** escopadas por dono. A tela
`/ponto` ganha um **painel inline** (ocioso → ativo); nas demais telas, um **card flutuante** no `(app)/layout`
mostra o mesmo estado. Ao **encerrar**, um **modal** (RHF + `useFieldArray`) lista os segmentos e, ao salvar,
cria **um `registro_ponto` por segmento** e apaga o rascunho. Tudo em **fuso de Brasília**.

## 2. Componentes Afetados

| Componente / Módulo                    | Tipo     | Observação |
| -------------------------------------- | -------- | ---------- |
| `src/db/schema.ts`                     | Alterado | + `time_trackings`, `time_tracking_segments` (nova migração) |
| `src/lib/tz.ts`                        | Novo     | Helpers de fuso de Brasília (RN-14) |
| `src/lib/tracking/validation.ts`       | Novo     | Zod: iniciar / finalizar |
| `src/lib/tracking/data.ts`             | Novo     | Ler tracking ativo + tempo derivado |
| `src/lib/tracking/actions.ts`          | Novo     | start/pause/resume/adjust/stop/finalize/discard/fetch |
| `src/lib/tracking/use-tracking.ts`     | Novo     | Hook React Query + relógio ao vivo |
| `src/lib/stores/tracking-ui.ts`        | Novo     | Zustand: estado do modal de finalização |
| `src/app/(app)/ponto/tracking-panel.tsx` | Novo   | UI inline (ocioso/ativo) |
| `src/app/(app)/tracking-floater.tsx`   | Novo     | Card flutuante (fora da `/ponto`) |
| `src/app/(app)/tracking-finalize-dialog.tsx` | Novo | Modal de finalização (N segmentos) |
| `src/app/(app)/ponto/ponto-view.tsx`   | Alterado | Monta o `TrackingPanel` no topo |
| `src/app/(app)/layout.tsx`             | Alterado | Monta o `TrackingController` (floater + modal) |

## 3. Stack & Dependências

- **Framework/DB:** Next.js 16 (App Router, Server Actions) · Drizzle + Postgres. **Sem libs novas.**
- **Estado:** React Query (server state no client — tracking ativo) + Zustand (abrir/fechar modal). §6.
- **Form:** React Hook Form + Zod (`useFieldArray` no modal de finalização). §7.
- **UI:** shadcn/ui existente (`Modal`, `Input`, `Button`, `DateField`, `MarkdownEditor`, `Badge`) + `motion`.

## 4. Decisões Técnicas

| Decisão | Escolha | Alternativas | Por quê |
| ------- | ------- | ------------ | ------- |
| Tempo | Derivado de timestamps no servidor | Contador salvo/incrementado | Resiliente a logout/refresh; à prova de fraude do client (RN-03/04) |
| Segmentos | Tabela filha `time_tracking_segments` | JSON de segmentos numa coluna | Consultável, integridade por FK/índice, sem overlap |
| "Um por vez" | `UNIQUE(user_id)` em `time_trackings` | Checar em código só | Garantia no banco (RN-01) |
| Segmento aberto | `ended_at IS NULL` + **índice único parcial** por tracking | Coluna `status` | Estado é derivável; índice impede 2 abertos (RN-05/16) |
| Fuso | Helper `America/Sao_Paulo` via `Intl` | `Date` do servidor | `todayISODate()` atual usa fuso do servidor; feature exige Brasília (RN-14) |
| Relógio no client | `elapsedMs` do servidor + `(now − dataUpdatedAt)` se rodando | Recalcular por tz no client | Evita drift/tz; usa o instante em que o dado chegou |

## 5. Impactos

- **Migração:** nova migração (`db:generate` → `db:migrate`); só **cria** tabelas, não toca em existentes.
- **Compatibilidade:** não altera `registros_ponto` nem o fluxo atual de ponto — a finalização usa o mesmo
  formato de registro (spec 003). Nada quebra.
- **Integrações:** os pontos gerados aparecem normalmente em lista/relatórios (003/006/007).

## 6. Riscos & Mitigações

| Risco | Prob. | Impacto | Mitigação |
| ----- | ----- | ------- | --------- |
| Drift de relógio client × servidor | Média | Baixo | Exibição ancorada em `dataUpdatedAt`; servidor é a verdade |
| Corrida entre abas (2 pauses juntos) | Baixa | Baixo | Ações idempotentes (pause sem segmento aberto = no-op); índice único parcial |
| Segmento cruzando meia-noite | Média | Médio | `work_date` = data (Brasília) do **início** (RN-14) |
| Fuso do servidor ≠ Brasília | Alta | Médio | Helper dedicado de Brasília; finalização valida "não-futuro" contra hoje-Brasília |
| Segmento < 1 min | Média | Baixo | Arredonda p/ minuto, mínimo 1 (RN-11); editável no modal |

## 7. Estratégia de Testes

- **Unitários:** `tz.ts` (data em Brasília, virada de dia); `validation.ts` (iniciar/finalizar, limites);
  cálculo de `elapsedMs` e derivação de status em `data.ts` (função pura auxiliar).
- **Integração/manual:** roteiro de `acceptance.md` (CA-01..14), com foco em persistência pós-logout,
  pause sem modal, split em N pontos e o flutuante fora da `/ponto`.

## 8. Plano de Rollout

- Sem feature flag: entrega direta após migração aplicada. Rollback = reverter deploy + `drizzle-kit` da
  migração (as tabelas novas não têm dependentes).

## 9. Estimativa & Marcos

| Marco | Entrega | Frentes (paralelizáveis) |
| ----- | ------- | ------------------------ |
| M1 — Fundação | schema + migração + `tz.ts` + validação | base para todas |
| M2 — Servidor | `data.ts` + `actions.ts` (+ testes) | depende de M1 |
| M3 — Cliente/UI | hook + painel inline + flutuante + modal + fios | depende de M2 |
| M4 — Validação | typecheck/lint/testes + Playwright + `acceptance.md` | depende de M3 |
