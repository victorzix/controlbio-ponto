# Plan — <Nome da Feature>

> **Camada 2 — A ESTRATÉGIA TÉCNICA.** Como vamos atacar os requisitos do `spec.md`.
> Decisões de alto nível, não detalhes de implementação (esses vão no `design.md`).

## 1. Visão Geral da Abordagem

<Em poucas linhas: qual o caminho técnico escolhido para atender a spec.>

## 2. Componentes Afetados

| Componente / Módulo | Tipo de mudança (novo / alterado) | Observação |
| ------------------- | --------------------------------- | ---------- |
| <ex.: API de Ponto> | Novo                              | <...>      |
| <ex.: Banco>        | Alterado                          | <...>      |

## 3. Stack & Dependências

- **Linguagem / Framework:** <...>
- **Banco / Persistência:** <...>
- **Bibliotecas novas:** <nome + motivo + alternativa descartada>
- **Serviços externos:** <...>

## 4. Decisões Técnicas (ADRs resumidas)

| Decisão        | Opção escolhida | Alternativas consideradas | Por quê |
| -------------- | --------------- | ------------------------- | ------- |
| <ex.: Armazenar hash do ponto> | <SHA-256> | <...> | <compliance> |

## 5. Impactos

- **Migração de dados:** <há? como?>
- **Compatibilidade:** <quebra algo existente?>
- **Integrações:** <afeta outros sistemas/relatórios?>

## 6. Riscos & Mitigações

| Risco                         | Probabilidade | Impacto | Mitigação |
| ----------------------------- | ------------- | ------- | --------- |
| <ex.: latência na biometria>  | Média         | Alto    | <cache / fallback> |

## 7. Estratégia de Testes

- **Unitários:** <o que cobrir>
- **Integração:** <o que cobrir>
- **Aceitação:** <mapear contra os CA da spec>

## 8. Plano de Rollout

- <Feature flag? Migração faseada? Janela de deploy? Rollback?>

## 9. Estimativa & Marcos

| Marco        | Entrega                  | Estimativa |
| ------------ | ------------------------ | ---------- |
| <Marco 1>    | <...>                    | <...>      |