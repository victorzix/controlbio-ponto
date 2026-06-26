# Spec — Relatórios (painel do admin)

| Campo         | Valor               |
| ------------- | ------------------- |
| Status        | Aprovada            |
| Autor(es)     | Victor Raphael      |
| Criada em     | 2026-06-26          |
| Atualizada em | 2026-06-26          |

> **Camada 1 — O QUÊ e o PORQUÊ.**

## 1. Resumo

A tela inicial do admin deixa de ser uma saudação e passa a ser **Relatórios**:
um painel que consolida as **horas** e o **valor estimado** dos registros de
ponto da equipe, por período e por usuário. O admin escolhe o período
(semana / mês / intervalo, como em `/ponto`) e quais usuários entram no
relatório (por padrão, todos os ativos).

## 2. Problema / Motivação

Hoje o admin só consegue ver ponto pela ótica de cada usuário (não há visão de
equipe consolidada), e a home não entrega valor — é só um "Olá". Para fechar
pagamento/medição, o admin precisa saber, num lugar só: **quantas horas** cada
pessoa fez no período, **quanto isso representa em R$**, e **até quando** pagar.
A regra de pagamento do negócio é: as horas de um mês vencem no **dia 1º do mês
seguinte**.

## 3. Objetivos

- Dar ao admin uma visão consolidada de horas e valor da equipe por período.
- Reaproveitar o seletor de período do `/ponto` (semana / mês / intervalo).
- Permitir selecionar múltiplos usuários; por padrão, **todos os ativos**.
- Mostrar, por **mês** do período, a **data limite** de pagamento (1º do mês seguinte).
- Mostrar **totais** do conjunto e um **detalhamento por usuário**.

### Fora de escopo

- Edição de ponto a partir do relatório (continua em `/ponto`, pelo dono).
- Exportar/baixar (PDF/CSV), gráficos, fechamento/trava de período, marcar como pago.
- Visão de relatório para o funcionário (é tela de admin).
- Fuso/jornada/horas extras com regra trabalhista — aqui é soma simples de minutos.

## 4. Personas / Atores

| Ator  | Descrição                                                          |
| ----- | ------------------------------------------------------------------ |
| Admin | Acompanha horas/valor da equipe e organiza o pagamento por mês.    |

## 5. User Stories

- Como **admin**, quero **ver as horas e o valor estimado da equipe no período**,
  para **fechar a medição do mês**.
- Como **admin**, quero **escolher quais pessoas entram no relatório**, para
  **analisar um subconjunto** quando precisar.
- Como **admin**, quero **ver a data limite de pagamento de cada mês**, para
  **não perder o prazo (1º do mês seguinte)**.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                            | Prioridade |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | A home do admin deve exibir "Relatórios" (rótulo no menu e título da tela), no lugar da saudação.    | Must       |
| RF-02 | Filtro de período **semana / mês / intervalo**, igual ao de `/ponto`.                                | Must       |
| RF-03 | Seletor de **múltiplos usuários**; default = todos os usuários **ativos** selecionados.              | Must       |
| RF-04 | Para o conjunto e período, exibir **horas totais** e **valor estimado total**.                       | Must       |
| RF-05 | Agrupar por **mês** do período; cada mês exibe sua **data limite** = 1º do mês seguinte.             | Must       |
| RF-06 | Em cada mês, **detalhar por usuário**: horas e valor estimado de cada um.                            | Must       |
| RF-07 | A tela é **exclusiva do admin** (papel sem `ponto:ver_equipe` é redirecionado).                      | Must       |
| RF-08 | Exportar um **`.xlsx`** das entradas (não agregadas) dos usuários e período selecionados.            | Must       |
| RF-09 | O arquivo é **uma planilha** ordenada por usuário e depois por data, com **autofilter** no cabeçalho.| Must       |
| RF-10 | Colunas: Usuário, Data, Título, Horas (decimal), Valor estimado (R$), Descrição; **um único total geral** (sem subtotais por usuário). | Must |
| RF-11 | O total geral usa fórmula `SUBTOTAL`, recalculando ao **filtrar** (some quem o filtro esconde). | Must |

## 7. Regras de Negócio

- **RN-01:** **Valor estimado** de um usuário = `minutos × (valor/hora) ÷ 60`,
  usando o valor/hora **daquele** usuário. Quem não tem valor/hora definido
  conta horas, mas o valor aparece como "—" e **não** entra no total de R$.
- **RN-02:** **Data limite** de um mês `AAAA-MM` = **1º dia** de `AAAA-(MM+1)`
  (dezembro → 1º de janeiro do ano seguinte).
- **RN-03:** O agrupamento por mês usa o **mês da data do registro** (`work_date`),
  e cada mês soma **apenas** os dias dentro do período selecionado.
- **RN-04:** Acesso exige `ponto:ver_equipe` (só admin). A leitura é sempre no
  servidor com essa guarda; o client nunca recebe dados sem ela.
- **RN-05:** Usuários **inativos** não vêm marcados por padrão, mas o admin pode
  incluí-los manualmente no seletor.
- **RN-06:** A exportação usa **a mesma seleção e período** da tela. As **horas**
  no arquivo vão como **número decimal** (h) e o **valor** como número (R$), para
  somarem no Excel; quem não tem valor/hora fica com valor vazio (não soma). O
  **total geral** é uma fórmula `SUBTOTAL(9, ...)` (fora do range do filtro), que
  ignora as linhas escondidas pelo filtro — ao filtrar por usuário/data, recalcula.
- **RN-07:** O download é gerado no servidor sob a mesma guarda `ponto:ver_equipe`.

## 8. Requisitos Não-Funcionais

- **Desempenho:** agregação feita no banco (GROUP BY usuário+mês), não no client.
- **Responsividade:** mobile first — detalhamento por usuário vira **cards** no
  mobile e **tabela** a partir de `md:` (padrão `/usuarios`).
- **Acessibilidade:** seletor de período/usuários por teclado, alvos ≥ 44px.

## 9. Critérios de Aceitação

- [ ] **CA-01:** Logado como admin, a home mostra "Relatórios" (menu + título);
      funcionário não vê o item e é redirecionado se acessar a rota.
- [ ] **CA-02:** Trocar período (semana/mês/intervalo) atualiza horas, valor e
      detalhamento.
- [ ] **CA-03:** Ao abrir, todos os usuários **ativos** já vêm selecionados e
      seus dados aparecem.
- [ ] **CA-04:** Desmarcar um usuário remove os dados dele dos totais e do
      detalhamento.
- [ ] **CA-05:** Para um mês de horas (ex.: junho/2026), a data limite exibida é
      **01/07/2026**; em dezembro, **01/01** do ano seguinte.
- [ ] **CA-06:** Um intervalo que cruza dois meses gera **dois blocos** de mês,
      cada um com suas horas/valor/data limite.
- [ ] **CA-07:** Usuário sem valor/hora aparece com horas e valor "—", e não
      infla o total de R$.
- [ ] **CA-08:** Funciona de ~360px ao desktop (cards no mobile, tabela no `md:`).
- [ ] **CA-09:** "Exportar Excel" baixa um `.xlsx` que abre no Excel, com as
      entradas dos usuários/período selecionados, ordenadas por usuário e data,
      autofilter no cabeçalho e **um único total geral**; horas/valor são números
      (somáveis) e quem não tem valor/hora fica sem valor.
- [ ] **CA-10:** Ao **filtrar por um usuário** no Excel, o **total geral
      recalcula** considerando só as linhas visíveis.

## 10. Questões em Aberto

- (resolvido) Data limite em período multi-mês → **uma por mês**.
- (resolvido) Detalhamento por usuário → **sim** (tabela/cards) + totais.
- (resolvido) Seleção default → **todos os ativos**.

## 11. Referências

- `docs/specs/003-registro-de-ponto/` — registros e KPIs do ponto.
- `docs/specs/002-usuarios/` — valor/hora do usuário.
- `src/lib/rbac.ts` — permissão `ponto:ver_equipe`.
- `docs/design-system.md` §6 (KPIs/tabelas/segmented control), §9.