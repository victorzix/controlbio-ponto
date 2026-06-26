# Spec — Ponto: visão de equipe (admin)

| Campo         | Valor               |
| ------------- | ------------------- |
| Status        | Aprovada            |
| Autor(es)     | Victor Raphael      |
| Criada em     | 2026-06-26          |
| Atualizada em | 2026-06-26          |

> **Camada 1 — O QUÊ e o PORQUÊ.**

## 1. Resumo

Na tela de **Ponto** ("Meus registros"), o **admin** passa a poder ver também os
registros de **outros usuários**. Um seletor (multi-seleção) permite escolher de
quem ver; ao abrir, vem **só o próprio usuário** (como hoje). Ao incluir outras
pessoas, a tela mostra os registros **por usuário**, em modo **somente leitura**.

## 2. Problema / Motivação

Hoje a tela de ponto é estritamente pessoal: cada um só vê e gerencia o próprio.
O admin não tem como inspecionar os lançamentos detalhados (título, descrição,
links, horas por dia) de um funcionário direto na tela de ponto — só vê o
agregado em Relatórios. Para conferir/auditar um lançamento específico, precisa
dessa visão detalhada de outra pessoa. Continua sendo **leitura**: criar/editar/
excluir ponto de terceiros não faz parte deste escopo.

## 3. Objetivos

- Permitir ao admin ver os registros detalhados de qualquer usuário na tela de ponto.
- Multi-seleção: 1, vários ou todos de uma vez.
- Default ao abrir = **somente o próprio** usuário, com o comportamento atual (CRUD).
- Ver outros é **somente leitura**.

### Fora de escopo

- Criar/editar/excluir/replicar ponto de **outro** usuário (segue restrito ao dono).
- Mudar o comportamento para o **funcionário** (continua vendo só o próprio, sem seletor).
- Exportação/Relatórios (já cobertos pela spec 006).

## 4. Personas / Atores

| Ator        | Descrição                                                         |
| ----------- | ----------------------------------------------------------------- |
| Admin       | Quer inspecionar os lançamentos detalhados de qualquer usuário.   |
| Funcionário | Continua com a tela de ponto pessoal, sem seletor (sem mudança).  |

## 5. User Stories

- Como **admin**, quero **selecionar outros usuários na tela de ponto**, para
  **ver os lançamentos detalhados deles**.
- Como **admin**, quero que **ao abrir já venha o meu**, para **seguir lançando
  o meu ponto normalmente**.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                         | Prioridade |
| ----- | ------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | Para o admin, a tela de ponto exibe um **seletor multi-usuário**.                                 | Must       |
| RF-02 | O default do seletor é **apenas o próprio** usuário.                                              | Must       |
| RF-03 | Com **só o próprio** selecionado, a tela mantém o comportamento atual (criar/editar/excluir/replicar). | Must  |
| RF-04 | Ao incluir **qualquer outro** usuário, a tela fica **somente leitura** (sem criar/editar/excluir/replicar). | Must |
| RF-05 | Na visão de equipe, os registros são exibidos **agrupados por usuário** (com nome e total).        | Must       |
| RF-06 | Período (semana/mês/intervalo) e KPIs continuam funcionando; os KPIs refletem o conjunto selecionado. | Should  |
| RF-07 | O seletor e a leitura de outros **não** aparecem para o funcionário.                              | Must       |

## 7. Regras de Negócio

- **RN-01:** Ver registros de outros exige `ponto:ver_equipe` (só admin), validado
  no servidor. O funcionário nunca recebe dados de terceiros.
- **RN-02:** Não há criação/edição/exclusão de ponto de terceiros — as actions de
  ponto continuam **escopadas ao dono** (RN-05 da spec 003). "Somente leitura" é
  garantido por construção (não existe action para mexer no ponto de outro).
- **RN-03:** "Só o próprio" = seleção com exatamente o id do usuário logado. Nesse
  caso a leitura usa o mesmo caminho de hoje (mutações invalidam o cache certo).
- **RN-04:** O **valor estimado** dos KPIs na visão de equipe soma, por usuário,
  `minutos × (valor/hora dele) ÷ 60`; quem não tem valor/hora não soma.

## 8. Requisitos Não-Funcionais

- **Segurança:** a leitura multi-usuário só responde com `ponto:ver_equipe`.
- **Responsividade:** mobile first; o seletor e as seções por usuário funcionam de ~360px.
- **Consistência:** reusa o seletor multi-usuário e os componentes de lista/KPIs já existentes.

## 9. Critérios de Aceitação

- [ ] **CA-01:** Admin abre o ponto e vê **só os seus** registros, com "Novo
      registro" e ações de editar/excluir/replicar disponíveis (como hoje).
- [ ] **CA-02:** Admin adiciona outro usuário no seletor → a tela passa a listar
      os registros **por usuário**, **sem** "Novo registro" e **sem** ações de
      editar/excluir/replicar.
- [ ] **CA-03:** Admin seleciona "todos" → vê todos os usuários, cada um com seus
      registros e total de horas.
- [ ] **CA-04:** Admin volta a deixar **só ele** selecionado → o CRUD volta a aparecer.
- [ ] **CA-05:** Funcionário **não** vê seletor nem registros de outros.
- [ ] **CA-06:** Período (semana/mês/intervalo) filtra a visão de equipe também.
- [ ] **CA-07:** Funciona de ~360px ao desktop.

## 10. Questões em Aberto

- (resolvido) Seletor → **multi-seleção** (1, vários ou todos).
- (resolvido) Editar de outros → **não**, somente leitura.

## 11. Referências

- `docs/specs/003-registro-de-ponto/` — registros, ações escopadas ao dono.
- `docs/specs/006-relatorios/` — seletor multi-usuário (`user-multiselect.tsx`).
- `src/lib/rbac.ts` — `ponto:ver_equipe`.