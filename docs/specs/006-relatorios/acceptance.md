# Acceptance — Relatórios

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | A validar  |
| Atualizada em | 2026-06-26 |

> **Camada 5 — VALIDAÇÃO HUMANA.** Rastreável aos CAs da `spec.md`.

## Pré-condições

- `npm run dev` + Postgres no ar.
- Existir um **admin** e ≥ 2 **funcionários**, alguns com **valor/hora** definido
  e ao menos um **sem** valor/hora; e registros de ponto em ≥ 2 meses distintos
  (para validar o agrupamento e a data limite).

## Casos

### AC-01 — Acesso e rótulo (CA-01, RF-01/07)
1. Logar como **admin**: o menu mostra **"Relatórios"** (ícone de gráfico) e a
   home abre a tela "Relatórios".
2. Logar como **funcionário**: não há item de relatório; acessar `/` redireciona
   para `/ponto`.
   - ✅ Esperado: tela exclusiva do admin.

### AC-02 — Filtro de período (CA-02)
1. Alternar Semana / Mês / Intervalo; no Intervalo, escolher um range.
   - ✅ Esperado: horas, valor e detalhamento atualizam conforme o período.

### AC-03 — Seleção default = ativos (CA-03)
1. Ao abrir, o botão "Usuários (N)" já reflete **todos os ativos** e os dados
   deles aparecem.
   - ✅ Esperado: nada de tela vazia por falta de seleção inicial.

### AC-04 — Alterar seleção (CA-04, RN-05)
1. Abrir "Usuários", desmarcar alguém, **Aplicar**.
2. Marcar um usuário **inativo** (aparece com tag "inativo"), Aplicar.
   - ✅ Esperado: totais e detalhamento refletem exatamente os selecionados; a
     query só refaz ao "Aplicar".

### AC-05 — Data limite por mês (CA-05, CA-06, RN-02/03)
1. Com período "Mês" em junho/2026: bloco "Junho de 2026", **Data limite 01/07/2026**.
2. Com um Intervalo cruzando maio→junho: **dois blocos**, cada um com suas
   horas/valor e data limite (01/06 e 01/07).
3. (Se houver dados) dezembro → data limite **01/01** do ano seguinte.
   - ✅ Esperado: agrupamento e datas corretos.

### AC-06 — Valor estimado e usuário sem taxa (CA-07, RN-01)
1. Conferir o valor de um usuário com valor/hora = horas × taxa.
2. Usuário **sem** valor/hora: Valor mostra "—" e **não** soma ao total de R$ do mês.
   - ✅ Esperado: total de R$ ignora quem não tem taxa; horas continuam somando.

### AC-07 — Responsividade (CA-08)
1. A ~360px: filtros empilhados, detalhamento em **cards**; a partir de `md:`,
   detalhamento em **tabela**. Sem scroll horizontal.
   - ✅ Esperado: usável em mobile e desktop.

### AC-08 — Exportar Excel (CA-09, CA-10, RF-08/09/10/11)
1. Com usuários e período selecionados, clicar **"Exportar Excel"**: baixa um
   `.xlsx` que **abre no Excel/LibreOffice** sem aviso de arquivo corrompido.
2. Conferir: uma planilha, colunas Usuário/Data/Título/Horas/Valor estimado/Descrição,
   **filtro** (setas) no cabeçalho; entradas **ordenadas por usuário e depois data**.
3. Há **uma única** linha **Total geral** ao fim (sem subtotais por usuário).
   Horas/valor são **números** (dá pra somar/SUM).
4. **Filtrar por um usuário** pelo cabeçalho: o **Total geral recalcula** só com as
   linhas visíveis (fórmula `SUBTOTAL`).
5. Usuário **sem valor/hora**: entradas com valor em branco; não infla o total de R$.
6. Sem nenhum usuário selecionado, o botão fica **desabilitado**.
   - ✅ Esperado: arquivo íntegro, organizado, somável e com total reativo ao filtro.

## Resultado

- [ ] Todos os casos acima passaram.
- Observações: