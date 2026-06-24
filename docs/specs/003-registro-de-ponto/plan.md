# Plan — Registro de Ponto

> **Camada 2 — A ESTRATÉGIA TÉCNICA.**

## 1. Visão Geral da Abordagem

Nova tabela `registros_ponto` (1:N com `users`). Cadastro via **Server Action** e listagem via
**Server Component**, sempre escopados ao usuário autenticado (`requirePermission` + `getCurrentUser`).
A descrição é **Markdown** guardado como texto; renderizada por um componente **próprio e seguro**
(`<Markdown>`) que monta elementos React (sem `dangerouslySetInnerHTML`) — zero dependência nova.

## 2. Componentes Afetados

| Componente / Módulo                         | Tipo  | Observação                                            |
| ------------------------------------------- | ----- | ----------------------------------------------------- |
| Banco — tabela `registros_ponto`            | Novo  | Migration nova; FK para `users`.                      |
| `src/components/ui/markdown.tsx`            | Novo  | Renderer Markdown seguro (subset). Server/Client-safe.|
| `src/app/(app)/ponto/markdown-editor.tsx`   | Novo  | Editor: textarea + toolbar + preview (client).        |
| `src/lib/ponto/validation.ts`               | Novo  | Schema `zod`.                                         |
| `src/lib/ponto/data.ts`                     | Novo  | `listOwnEntries(userId)`.                             |
| `src/lib/ponto/actions.ts`                  | Novo  | `createEntry`.                                        |
| `src/app/(app)/ponto/*`                     | Novo  | Lista (`page.tsx`), form (`ponto-form.tsx`), `/novo`. |
| `src/app/(app)/layout.tsx`                  | Alt.  | Link "Ponto" na nav (todos os autenticados).          |

## 3. Stack & Dependências

- Next.js 16, TypeScript, Drizzle, Tailwind/shadcn, motion. **Sem dependências npm novas.**
- **Markdown:** parser/renderer escrito à mão (subset seguro). Sem `react-markdown`, sem editor WYSIWYG.
- Validação: `zod` (já instalado).

## 4. Decisões Técnicas (ADRs resumidas)

| Decisão                | Opção escolhida                         | Alternativas                | Por quê |
| ---------------------- | --------------------------------------- | --------------------------- | ------- |
| Rich text              | Markdown + renderer próprio seguro       | Tiptap (WYSIWYG); react-markdown | Zero dep (registry trava aqui); seguro por construção (sem HTML cru). |
| Tempo trabalhado       | `worked_minutes` (int, total de minutos) | dois campos no banco; interval | Simples de validar/somar; UI converte para H:M. |
| Dia                    | `date` (`mode: "string"` YYYY-MM-DD)     | timestamp                   | É um dia, não um instante; evita bug de fuso. |
| Dono do registro       | Definido no servidor (`currentUser.id`)  | id vindo do form            | Segurança (RN-05). |
| Edição da descrição    | textarea + toolbar (insere markdown) + preview | contentEditable        | Sem dep, previsível, seguro. |

## 5. Impactos

- **Migração:** nova tabela `registros_ponto` (aditiva).
- **Compatibilidade:** aditivo; nova rota `/ponto` em `(app)`.
- **Reuso:** o `<Markdown>` fica disponível para futuras telas.

## 6. Riscos & Mitigações

| Risco                              | Prob. | Impacto | Mitigação                                                        |
| ---------------------------------- | ----- | ------- | ---------------------------------------------------------------- |
| XSS via descrição                  | Média | Alto    | Renderer monta nós React (texto auto-escapado); links com allowlist de esquema; sem `dangerouslySetInnerHTML`. |
| Ver/criar registro de outro        | Baixa | Alto    | Dono = `currentUser.id` no servidor; listagem filtra por dono.   |
| Markdown malformado quebrar a tela | Média | Baixo   | Parser tolerante (texto cai como parágrafo); testes unitários.   |
| Fuso/data trocando o dia           | Média | Médio   | `date` como string YYYY-MM-DD; formatação manual.                |

## 7. Estratégia de Testes

- **Unitários:** `validation` (tempo > 0 e ≤ 24h, dia não-futuro, descrição obrigatória); **renderer**
  Markdown (negrito/itálico/link/lista; **segurança**: ignora HTML cru e `javascript:`).
- **Aceitação:** `acceptance.md` (CA-01..09), incluindo o teste de injeção (CA-08) e mobile.

## 8. Plano de Rollout

- Sem flag. Ordem: schema+migration → renderer → validação/data/actions → editor → páginas → nav.
- **Rollback:** remover rota `/ponto`, módulos `lib/ponto`, o componente, e reverter a migration.

## 9. Estimativa & Marcos

| Marco   | Entrega                                             | Estimativa |
| ------- | --------------------------------------------------- | ---------- |
| Marco 1 | Tabela + renderer Markdown seguro (com testes)      | ~0,5 dia   |
| Marco 2 | Validação + actions + data + editor                 | ~0,5 dia   |
| Marco 3 | Páginas (lista + novo) + nav + toasts               | ~0,5 dia   |
| Marco 4 | Testes + aceitação                                  | ~0,5 dia   |
