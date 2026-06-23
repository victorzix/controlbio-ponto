# Specs — Desenvolvimento Orientado a Especificação

Esta pasta concentra as especificações de cada funcionalidade do **controlbio-ponto**.
A ideia do *Spec-Driven Development* é **pensar antes de codar**: cada feature passa por
camadas que vão do abstrato (o problema) ao concreto (as tarefas), e cada camada só
existe depois que a anterior está acordada.

## Fluxo

```
spec.md  ──►  plan.md  ──►  design.md  ──►  tasks.md  ──►  código  ──►  acceptance.md
 (o quê)     (a estratégia)  (o detalhe)    (a execução)            (a validação humana)
```

1. **`spec.md`** — Define o **problema e os requisitos**. Responde *o quê* e *por quê*.
   Não fala de tecnologia nem de implementação. É o documento que um stakeholder não-técnico
   conseguiria validar.
2. **`plan.md`** — Define a **abordagem técnica** em alto nível. Stack, arquitetura,
   decisões, dependências e riscos. Responde *como vamos atacar isso*.
3. **`design.md`** — Detalha o **como**: modelo de dados, contratos de API, fluxos,
   esquema de banco, telas. É a planta baixa que orienta a implementação.
4. **`tasks.md`** — Quebra o design em **tarefas executáveis e verificáveis**, em ordem.
5. **`acceptance.md`** — Roteiro de **testes de aceitação** executados por uma pessoa (QA/usuário):
   casos de uso passo a passo, rastreáveis aos critérios de aceitação da spec.

> Nem toda feature precisa das 4 camadas. Uma correção simples pode viver só num `spec.md`.
> Use o bom senso: o objetivo é reduzir retrabalho, não gerar burocracia.

## Como criar uma nova feature

1. Copie a pasta `_template/` para `docs/specs/NNN-nome-da-feature/`
   (ex.: `001-registro-de-ponto`). O número mantém a ordem cronológica.
2. Preencha `spec.md` primeiro e valide com quem for de direito.
3. Avance para `plan.md`, depois `design.md` e por fim `tasks.md`.
4. Vá marcando as tarefas em `tasks.md` conforme a implementação avança.

## Convenções

- Pastas em `kebab-case`, prefixadas por número sequencial: `001-`, `002-`, ...
- Deixe campos *Em aberto* / *A definir* explícitos — é melhor que uma omissão silenciosa.
- Atualize a spec quando a realidade mudar; documento desatualizado é pior que ausente.