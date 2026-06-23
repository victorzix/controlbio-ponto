# Tasks — <Nome da Feature>

> **Camada 4 — A EXECUÇÃO.** Quebra do `design.md` em tarefas pequenas, ordenadas e
> verificáveis. Marque conforme avança. Cada tarefa deve caber idealmente em meio dia.

## Legenda

- `[ ]` pendente · `[~]` em andamento · `[x]` concluída
- Indique dependências com `(dep: T2)`.

## Tarefas

### Preparação
- [ ] **T1** — <ex.: criar migração da tabela de pontos> · _ref: design §2_
- [ ] **T2** — <ex.: configurar dependência X> (dep: T1)

### Implementação
- [ ] **T3** — <ex.: endpoint POST /pontos> · _ref: design §3_ · _atende: RF-01_
- [ ] **T4** — <ex.: validação RN-01> (dep: T3)

### Testes
- [ ] **T5** — <testes unitários do serviço de ponto>
- [ ] **T6** — <teste de aceitação cobrindo CA-01>

### Finalização
- [ ] **T7** — <documentação / atualização de README>
- [ ] **T8** — <revisão e deploy>

## Definição de Pronto (DoD)

- [ ] Todos os critérios de aceitação (`spec.md` §9) verificados.
- [ ] Testes passando.
- [ ] Code review aprovado.
- [ ] Documentação atualizada.

## Notas de Implementação

<Decisões tomadas durante o desenvolvimento, desvios do design e o motivo.>