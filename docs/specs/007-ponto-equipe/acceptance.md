# Acceptance — Ponto: visão de equipe

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | A validar  |
| Atualizada em | 2026-06-26 |

> **Camada 5 — VALIDAÇÃO HUMANA.** Rastreável aos CAs da `spec.md`.

## Pré-condições

- `npm run dev` + Postgres no ar.
- Um **admin** e ≥ 2 **funcionários**, com registros de ponto no período de teste.

## Casos

### AC-01 — Default = só o admin, com CRUD (CA-01, RF-02/03)
1. Logar como admin, abrir **Ponto**. Título "Meus registros", seletor "Usuários (1)".
2. Conferir que aparecem só os seus registros e que há "Novo registro" e os ícones
   de editar/excluir/replicar.
   - ✅ Esperado: comportamento idêntico ao atual.

### AC-02 — Incluir outro vira somente leitura (CA-02, RF-04/05)
1. No seletor, marcar também outro usuário e Aplicar.
2. Conferir: título "Registros da equipe"; registros **agrupados por usuário**
   (nome + total de horas); **sem** "Novo registro"; **sem** editar/excluir/replicar.
   Links (quando houver) continuam clicáveis.
   - ✅ Esperado: leitura da equipe, sem edição.

### AC-03 — Todos (CA-03)
1. No seletor, "Marcar todos" → Aplicar.
   - ✅ Esperado: cada usuário com registros aparece em sua seção, com total.

### AC-04 — Voltar a só eu (CA-04)
1. No seletor, deixar só o admin (ou "Limpar" e marcar só ele) → Aplicar.
   - ✅ Esperado: volta "Meus registros" com CRUD.

### AC-05 — Funcionário sem seletor (CA-05, RF-07)
1. Logar como funcionário, abrir Ponto.
   - ✅ Esperado: **sem** seletor; vê só o próprio; CRUD do próprio normal.

### AC-06 — Período (CA-06)
1. Com a equipe selecionada, alternar Semana/Mês/Intervalo.
   - ✅ Esperado: a visão de equipe e os KPIs respeitam o período.

### AC-07 — Responsividade (CA-07)
1. A ~360px: filtros e seções por usuário usáveis, sem scroll horizontal.
   - ✅ Esperado: ok no mobile e desktop.

## Resultado

- [ ] Todos os casos acima passaram.
- Observações: