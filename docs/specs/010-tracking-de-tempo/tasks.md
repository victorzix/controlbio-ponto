# Tasks — Tracking de Tempo (Cronômetro de Ponto)

> **Camada 4 — A EXECUÇÃO.** Quebra do `design.md` em tarefas verificáveis. As **frentes** F-B/F-C podem
> ser tocadas por agentes diferentes **após** a M1 (fundação), pois dependem do contrato do servidor.

## Legenda
- `[ ]` pendente · `[~]` em andamento · `[x]` concluída · `(dep: Tn)` dependência.

## M1 — Fundação (base de tudo)
- [x] **T1** — `src/lib/tz.ts`: `BRASILIA_TZ`, `brasiliaDateISO`, `todayBrasiliaISO` · _design §3_ · _RN-14_
- [x] **T2** — `schema.ts`: tabelas `time_trackings` (UNIQUE user_id) e `time_tracking_segments` (índice único parcial `ended_at IS NULL`) · _design §2_ · _RN-01/05/16_
- [x] **T3** — `db:generate` + `db:migrate` (`0009_far_fallen_one`) (dep: T2)
- [x] **T4** — `src/lib/tracking/validation.ts`: `startTrackingSchema`, `finalizeTrackingSchema` · _design §4_

## M2 — Servidor (dep: M1)
- [x] **T5** — `src/lib/tracking/data.ts` + `compute.ts`: `getActiveTracking` + `computeElapsedAndStatus` (puro) · _RF-02_
- [x] **T6** — `src/lib/tracking/actions.ts`: `fetchActiveTracking`, `startTracking`, `pauseTracking`, `resumeTracking` (dep: T5)
- [x] **T7** — `actions.ts`: `adjustCurrentStart` (RN-07/16), `stopTracking`, `discardTracking` (dep: T6)
- [x] **T8** — `actions.ts`: `finalizeTracking` (TX: N `registros_ponto` + apaga rascunho) · _RN-10_ (dep: T6)
- [x] **T9** — testes: `tz.test.ts`, `tracking/validation.test.ts`, `tracking/compute.test.ts` (dep: T4,T5,T8)

## M3 — Cliente / UI (dep: M2)
- [x] **T10** — `src/lib/stores/tracking-ui.ts` (Zustand: `finalizeOpen`) · _design §5_
- [x] **T11** — `src/lib/tracking/use-tracking.ts` + `format.ts`: `useActiveTracking`, `useElapsedMs`, `useTrackingControls` (dep: T6)
- [x] **T12** — `ponto/tracking-panel.tsx`: ocioso e ativo (dep: T11)
- [x] **T13** — `tracking-finalize-dialog.tsx`: modal `useFieldArray`, "usar descrição em todos", remover bloco (dep: T11, T8)
- [x] **T14** — `tracking-floater.tsx`: card fixo, escondido na `/ponto` (usePathname) e sem tracking (dep: T11)
- [x] **T15** — `TrackingController` no `(app)/layout.tsx`; `TrackingPanel` no `ponto-view.tsx` (abaixo dos KPIs) (dep: T12,T13,T14)

## M4 — Validação (dep: M3)
- [x] **T16** — `npm run test` (63 ok) + `tsc --noEmit` (0) + `npm run lint` (0) (dep: T15)
- [~] **T17** — Verificação no navegador (Playwright): fluxo principal OK; itens ⬜ do `acceptance.md` a validar manual (dep: T16)
- [ ] **T18** — Atualizar `docs/design-system.md` se formalizar o card flutuante/painel como padrão · _CLAUDE.md §5_ (usou só tokens existentes; sem token novo)

## Definição de Pronto (DoD)
- [ ] Critérios de aceitação (`spec.md` §9) verificados.
- [ ] Testes passando; typecheck e lint limpos.
- [ ] Mobile ~360px ok; `prefers-reduced-motion` respeitado.
- [ ] Migração aplicada e revisada.

## Notas de Implementação

- **`computeElapsedAndStatus` extraído para `compute.ts`** (não ficou em `data.ts`): função pura, sem
  dependência de `db`, para testar sem abrir conexão com o banco. `data.ts` reexporta o tipo.
- **Relógio ao vivo (`useTrackingClock`)**: ancorado em `dataUpdatedAt` do React Query; `now` é `state`
  atualizado só pelo `setInterval` (subscription) — evita `Date.now()` no render (regra `react-hooks/purity`)
  e `setState` síncrono em efeito. `Math.max(0, ...)` cobre um tick defasado logo após refetch. Retorna
  **`totalMs`** e **`currentBlockMs`** (feedback do usuário: mostrar bloco atual grande + total menor).
- **Ajuste de início (feedback do usuário)**: deixou de ser botão + `datetime-local`. Agora **clicar no
  relógio** abre um popover com **input de texto** (`parseTimeToHM`: aceita `HH:MM`, `2340`, `940`, `23`) +
  **data opcional** (`type=date`, default = dia do início). `parseTimeToHM` é puro (em `format.ts`) e testado.
  As **datas consideradas** (`work_date`) seguem derivadas em Brasília no servidor (RN-14).
- **Bug pré-existente corrigido**: `src/lib/ponto/validation.test.ts` não passava `project` (obrigatório
  desde o commit `ef9ab72`) no fixture — ajustado (fora do escopo, mas deixava a suíte vermelha).
- **A11y**: filtro de projeto do `ponto-view` migrado de `aria-selected` → `aria-checked` (role radio).
- **Design system**: painel e flutuante usam apenas tokens existentes (`bg-card`, `border-primary/30`,
  `text-primary`, ...). Não houve token novo, então nada a registrar em `design-system.md` (T18 aberta caso
  se queira formalizar o padrão "card flutuante").
