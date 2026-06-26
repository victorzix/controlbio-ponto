# Plan — Minha conta

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Aprovada   |
| Atualizada em | 2026-06-26 |

> **Camada 2 — A ESTRATÉGIA.** Abordagem técnica em alto nível.

## Abordagem

Feature pequena que reusa quase tudo que já existe. Duas frentes:

1. **Backend — Server Action de autoatendimento.** Em vez de reaproveitar
   `updateUser` (que exige `usuarios:editar`, só admin, e recebe um `id`), criar
   um módulo dedicado `src/lib/conta/` com uma action `updateOwnAccount(input)`
   que:
   - exige apenas **sessão válida** (`requireUser()`), não uma permissão de admin;
   - opera sobre `currentUser.id` (o alvo nunca vem do client — RN-01);
   - valida com um schema próprio (nome, username, email, password opcional) —
     **sem** role nem hourlyRate (RN-02);
   - checa unicidade de username/email ignorando o próprio (RN-03);
   - grava hash da senha só quando informada (RF-04), com o mesmo `hashPassword`.

   Módulo separado de `usuarios/` porque a fronteira de autorização é outra
   (qualquer usuário × só admin) e o conjunto de campos é menor — evita ramificar
   a action de admin com flags de "é a própria conta".

2. **Frontend — controle na sidebar + modal.** A sidebar (client) ganha um botão
   de conta (avatar + nome) no rodapé que abre um `Modal` com um formulário
   (RHF + Zod, no padrão do `UserForm`). O layout passa os dados do usuário para a
   sidebar. No sucesso: fecha o modal, `router.refresh()` (atualiza o nome
   renderizado no servidor — RF-06) e toast.

## Decisões

- **Módulo `conta/` separado** (não estender `usuarios/`): autorização e escopo
  de campos distintos. Pequena duplicação de schema é aceitável e mantém o módulo
  de admin sem condicionais de "self".
- **Avatar com iniciais** (componente puro, sem radix): o avatar do shadcn
  depende de radix e o registry trava (design-system §6). Como é só iniciais num
  círculo, escrevemos um componente puro com os tokens do tema.
- **`router.refresh()`** para refletir o nome novo na sidebar (Server Component
  no layout) — mesmo padrão do `/ponto` (design-system §6).
- **Sem React Query aqui:** não há lista a invalidar; a mutação é Server Action e
  o refresh do servidor basta (CLAUDE.md §6, exceção idiomática do App Router).

## Dependências

- Nenhuma dependência npm nova (evita o travamento de install do ambiente).
- Reusa: `Modal`, `hashPassword`, `requireUser`, `normalizeUsernameInput`,
  `deriveUsernameFromName`, tokens `--sidebar-*`.

## Riscos

- **Hidratação da sidebar:** já tratada (rail via `useSyncExternalStore`); o novo
  controle não lê estado persistido, então sem novo risco.
- **z-index modal × drawer mobile:** ambos `z-50`; ao abrir a conta pelo drawer,
  fechar o drawer antes para o modal não ficar atrás.