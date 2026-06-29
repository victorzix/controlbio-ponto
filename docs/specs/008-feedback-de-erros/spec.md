# Spec — Feedback de erros no front-end

| Campo         | Valor          |
| ------------- | -------------- |
| Status        | Implementada   |
| Autor(es)     | Victor Raphael |
| Criada em     | 2026-06-29     |
| Atualizada em | 2026-06-29     |

> **Camada 1 — O QUÊ e o PORQUÊ.** Correção/endurecimento transversal de UX:
> garantir que **todo** erro chegue ao usuário. Sem feature de domínio nova —
> por isso uma spec única e enxuta (ver `docs/specs/README.md`, "correção simples").

## 1. Resumo

Padroniza a exibição de erros no front. Hoje erros de validação e erros de
negócio retornados pelas Server Actions aparecem; mas quando uma action
**lança** (erro de servidor/DB, exceção inesperada), o formulário **engole o
erro em silêncio** e a tela parece travada. Esta spec fecha esse buraco e
documenta a convenção de feedback.

## 2. Problema / Motivação

Os `onValid` dos formulários (login, ponto, usuários, conta) chamam a Server
Action **sem `try/catch`**. O React Hook Form, ao receber uma `Promise`
rejeitada do handler, não exibe nada — então um erro de servidor (ex.: tabela
inexistente, queda do banco, bug) resulta em **zero feedback**: o usuário clica
"Entrar"/"Salvar" e nada acontece, sem pista do que houve.

Além disso, não há `error.tsx`/`global-error.tsx`/`not-found.tsx`: um erro de
render ou rota inexistente cai na tela padrão (crua) do Next.

## 3. Objetivos

- Nenhuma ação de formulário pode falhar silenciosamente.
- Erro inesperado (action que lança) sempre vira feedback visível (toast).
- Erro de render não-capturado e 404 têm telas próprias, no padrão visual.

### Fora de escopo

- Mudar o shape de retorno das Server Actions (continua `{ ok }` /
  `{ error }` / `{ fieldErrors }`).
- Telemetria/observabilidade de erros (Sentry et al.).
- Retry automático de mutações.

## 4. Regras de Negócio (convenção de feedback)

- **RN-01 — Erro de campo/validação → inline.** `formState.errors[campo]`
  abaixo do respectivo campo (padrão atual mantido).
- **RN-02 — Erro de negócio retornado (`{ error }`) → inline no root.**
  Ex.: "Usuário ou senha inválidos." continua aparecendo no formulário, perto
  da ação. Não vira toast.
- **RN-03 — Erro inesperado (action lança / rejeita) → toast de erro.** Sem
  campo a que se prender, usa `toast.error` com mensagem genérica e registra o
  erro no console. Centralizado em `notifyUnexpectedError` (`src/lib/forms/notify-error.ts`).
- **RN-04 — `redirect()` do framework não é erro.** Server Actions que chamam
  `redirect()`/`requirePermission` são tratadas no boundary do Next (navegam),
  não rejeitam no client — o `try/catch` não as captura.

## 5. Critérios de Aceitação

- [x] **CA-01:** Dado o banco indisponível, quando submeto qualquer formulário,
      então vejo um toast de erro (não tela travada).
- [x] **CA-02:** Dado login com senha errada, quando submeto, então vejo
      "Usuário ou senha inválidos." inline (comportamento preservado).
- [x] **CA-03:** Dado um erro de render numa página interna, quando ele ocorre,
      então vejo uma tela de erro com botão "Tentar de novo".
- [x] **CA-04:** Dado uma URL inexistente, então vejo uma página 404 no padrão.

## 6. Referências

- `docs/design-system.md` §6 (Feedback) e §10 (Páginas de erro).
- `CLAUDE.md` §6/§7 (React Query/Zustand, RHF+Zod).
