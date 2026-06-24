# Plan — Usuários

> **Camada 2 — A ESTRATÉGIA TÉCNICA.**

## 1. Visão Geral da Abordagem

CRUD de usuários sobre a tabela `users` **já existente** (sem migration). Tudo via **Server Components**
(leitura) e **Server Actions** (escrita), reaproveitando o núcleo de auth: `getCurrentUser()`,
`hashPassword()`, `invalidateAllSessions()` e o RBAC (`can()`/`assertCan()`). Autorização é checada
**no servidor** em cada página e ação. UI com shadcn/ui + Tailwind, mobile first, sem dependências novas.

## 2. Componentes Afetados

| Componente / Módulo                       | Tipo     | Observação                                            |
| ----------------------------------------- | -------- | ----------------------------------------------------- |
| `src/lib/usuarios/validation.ts`          | Novo     | Schemas `zod` (criar/editar).                         |
| `src/lib/usuarios/data.ts`                | Novo     | Leituras: `listUsers(q)`, `getUserById(id)`.          |
| `src/lib/usuarios/actions.ts`             | Novo     | `createUser`, `updateUser`, `setUserActive`.          |
| `src/lib/auth/guard.ts`                   | Novo     | `requireUser`, `requirePermission` (server-side).     |
| `src/app/(app)/usuarios/*`                | Novo     | Lista, criar (`/novo`), editar (`/[id]`).             |
| `src/app/(app)/layout.tsx`                | Alterado | Nav com link "Usuários" condicionado à permissão.     |
| `src/components/ui/table.tsx`             | Novo     | Componente shadcn `table` (puro, escrito à mão).      |
| `src/components/ui/badge.tsx`             | Novo     | Badge de status/papel (puro, escrito à mão).          |
| Banco                                     | —        | **Sem mudança** (reusa `users`).                      |

## 3. Stack & Dependências

- Next.js 16 (App Router, Server Actions/Components), TypeScript, Drizzle, Tailwind v4, shadcn/ui, motion.
- **Sem dependências npm novas** (decisão deliberada — o registry trava neste ambiente). Componentes
  novos do shadcn (`table`, `badge`) são **puros** (só usam `cn`) e entram como código.
- **Select de papel:** `<select>` nativo estilizado (sem `@radix-ui/react-select`) — ótimo no mobile
  (usa o seletor nativo do SO) e zero dependência.
- **Validação:** `zod` (já instalado).

## 4. Decisões Técnicas (ADRs resumidas)

| Decisão                  | Opção escolhida                  | Alternativas               | Por quê |
| ------------------------ | -------------------------------- | -------------------------- | ------- |
| Formulários              | Páginas dedicadas (`/novo`, `/[id]`) | Dialog/modal (radix)   | Evita dep `@radix-ui/react-dialog`; páginas são simples e ótimas no mobile. |
| Select de papel          | `<select>` nativo estilizado     | shadcn `select` (radix)    | Zero dependência; UX nativa no celular. |
| Form + estado            | `useActionState` + Server Action | react-hook-form            | Mesmo padrão do login; sem dep extra. |
| Desativação              | Soft (`active=false`) + revogar sessões | Hard delete         | Preserva histórico; corta acesso na hora. |
| Autorização              | `requirePermission` no servidor (página e action) | só esconder UI | Segurança real (RN-08); esconder botões é só UX. |
| Senha na edição          | Campo opcional (em branco mantém) | Tela separada de senha    | Simples e suficiente para o escopo. |

## 5. Impactos

- **Migração:** nenhuma.
- **Compatibilidade:** aditivo; novas rotas dentro de `(app)`.
- **Integrações:** consolida o uso de `requirePermission` (padrão para as próximas features).

## 6. Riscos & Mitigações

| Risco                                      | Prob. | Impacto | Mitigação                                              |
| ------------------------------------------ | ----- | ------- | ------------------------------------------------------ |
| Auto-bloqueio do admin                     | Média | Alto    | RN-05 no servidor (não desativar/rebaixar a si mesmo). |
| Lockout total (último admin)               | Baixa | Alto    | Validar último admin ativo (questão em aberto §10).    |
| Escrita sem permissão via URL direta       | Média | Alto    | `requirePermission("usuarios:...")` em cada action.    |
| E-mail duplicado por corrida               | Baixa | Médio   | `unique` no banco + tratamento do erro de violação.    |
| Sessão do usuário desativado seguir válida | Baixa | Médio   | `invalidateAllSessions` + `getCurrentUser` filtra `active`. |

## 7. Estratégia de Testes

- **Unitários:** schemas `zod` (criar/editar, senha mínima, e-mail), regra de senha opcional na edição.
- **Integração (quando houver DB de teste):** unicidade de e-mail, desativar revoga sessões, bloqueio de
  auto-desativação, negação de escrita para não-admin (funcionário).
- **Aceitação:** `acceptance.md`, mapeado aos CA (inclui RBAC por papel e viewport mobile).

## 8. Plano de Rollout

- Sem feature flag. Ordem: helpers de guarda → validação/queries/actions → componentes UI → páginas → nav.
- **Rollback:** remover as rotas `(app)/usuarios` e os módulos `lib/usuarios`; nada no banco muda.

## 9. Estimativa & Marcos

| Marco   | Entrega                                            | Estimativa |
| ------- | -------------------------------------------------- | ---------- |
| Marco 1 | Guarda + validação + queries + actions             | ~0,5 dia   |
| Marco 2 | UI: lista + busca + status/papel                   | ~0,5 dia   |
| Marco 3 | UI: criar/editar + ativar/desativar + nav          | ~0,5 dia   |
| Marco 4 | Testes + aceitação                                 | ~0,5 dia   |
