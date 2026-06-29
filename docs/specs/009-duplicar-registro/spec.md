# Spec — Duplicar registro de ponto

| Campo         | Valor          |
| ------------- | -------------- |
| Status        | Implementada   |
| Autor(es)     | Victor Raphael |
| Criada em     | 2026-06-29     |
| Atualizada em | 2026-06-29     |

> Feature pequena e aditiva — spec única e enxuta (`docs/specs/README.md`).

## 1. Resumo

Adiciona um botão **Duplicar** em cada registro de ponto que cria, em **um
clique**, uma **cópia exata** do registro: mesmo título, dia, tempo trabalhado,
descrição e link. Diferente do **Replicar** existente (que abre o formulário só
com título + dia e exige redigitar o resto).

## 2. Problema / Motivação

Quem lança tarefas parecidas/repetidas precisa recriar tudo à mão ou usar o
Replicar e redigitar a descrição inteira. Faltava um "copiar igual" de verdade.

## 3. Objetivos

- Duplicar um registro com **todos** os campos, em um clique, sem modal.

### Fora de escopo

- Editar a cópia antes de salvar (use Editar depois, se precisar).
- Duplicar para outra data automaticamente (a cópia herda a data do original).
- Substituir o Replicar — os dois coexistem.

## 4. Regras de Negócio

- **RN-01 — Cópia exata.** A cópia herda título, `workDate`, `workedMinutes`,
  descrição e link do original, sem alteração.
- **RN-02 — Escopo por dono (igual aos demais writes).** Só duplica registro
  cujo dono é o usuário da sessão; o dono da cópia é sempre a sessão. Nunca
  confia em id de outro usuário.
- **RN-03 — Permissão.** Exige `ponto:registrar` (é uma criação). Reusa o mesmo
  gate do Replicar na UI (`canReplicate`).
- **RN-04 — Feedback.** Sucesso → `toast.success("Registro duplicado.")`; erro
  esperado → `toast.error`; erro inesperado → `notifyUnexpectedError` (spec 008).

## 5. Critérios de Aceitação

- [x] **CA-01:** Dado um registro meu, quando clico em Duplicar, então surge um
      novo registro idêntico (mesmo dia/tempo/descrição/link) e vejo o toast.
- [x] **CA-02:** Dado que duplico, então a lista atualiza sem recarregar a página.
- [x] **CA-03:** O botão Replicar continua funcionando como antes.

## 6. Referências

- `src/lib/ponto/actions.ts` (`duplicateEntry`), `src/app/(app)/ponto/ponto-entry-actions.tsx`.
- Spec `008-feedback-de-erros` (convenção de toast/erro).
