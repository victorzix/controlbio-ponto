# Design — Minha conta

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | Aprovada   |
| Atualizada em | 2026-06-26 |

> **Camada 3 — O DETALHE.** Planta baixa da implementação.

## 1. Modelo de dados

Nenhuma mudança de schema. Usa a tabela `users` existente (spec 002):
`name`, `username` (único), `email` (único, opcional), `passwordHash`.
Não toca em `role`, `hourlyRateCents`, `active`.

## 2. Validação (`src/lib/conta/validation.ts`)

`updateOwnAccountSchema` — subconjunto do `updateUserSchema` (sem `role`/`hourlyRate`):

```ts
{
  name:     string trim min(2)
  username: trim → normalizeUsernameInput → min(2)   // RN-06, igual à spec 004
  email:    trim → lower → email() | "" (opcional)
  password: min(8) | "" (opcional)                   // em branco mantém a atual
}
```

A normalização do username é a mesma de `@/lib/auth/username`, garantindo
consistência com o login (spec 004).

## 3. Server Action (`src/lib/conta/actions.ts`)

```ts
updateOwnAccount(input: unknown): Promise<ActionState>
```

Fluxo:
1. `const user = await requireUser()` — exige **sessão válida** (qualquer papel).
2. `updateOwnAccountSchema.safeParse(input)` → `{ fieldErrors }` se inválido.
3. Unicidade (RN-03), ignorando o próprio id:
   - `username` já usado por outro → `fieldErrors.username`.
   - `email` (quando informado) já usado por outro → `fieldErrors.email`.
4. Monta `updateData = { name, username, email|null }`; se `password` ≥ 8,
   `passwordHash = await hashPassword(password)`.
5. `db.update(users).set(updateData).where(eq(users.id, user.id))` em try/catch;
   violação UNIQUE de corrida → mapeada para `fieldErrors` (mesma lógica de `usuarios`).
6. `{ ok: true }`.

Reutiliza o tipo `ActionState` e os helpers de erro do padrão de `usuarios`
(duplicados localmente ou extraídos — ver tasks). **Nunca** recebe `id` do client (RN-01).

## 4. Telas / UI

> Segue `docs/design-system.md` — Modal (§6), Sidebar (§9), tokens `--sidebar-*` (§3),
> formulários RHF + Zod (`CLAUDE.md` §7). Abaixo só o específico desta tela.

### 4.1 Avatar (`src/components/ui/avatar.tsx`)

Componente **puro** (sem radix — registry trava, design-system §6): círculo com
as **iniciais** do nome (`bg-sidebar-accent text-sidebar-accent-foreground`,
`rounded-full`, `size-8`). Iniciais = primeira letra do primeiro e do último
token do nome (1–2 letras), maiúsculas. Aceita `className` para tamanho/cor.

### 4.2 Controle na sidebar (rodapé)

O rodapé passa de "texto do nome + Sair" para:

- **Botão de conta** (`flex-1`, alinhado à esquerda): `Avatar` + nome truncado;
  `min-h-[44px]`; abre o modal "Minha conta". No **rail**, some o texto (fade) e
  fica só o avatar, com `title`/`aria-label` = "Minha conta". No **mobile**, ao
  clicar fecha o drawer antes de abrir o modal (evita sobreposição z-50).
- **Botão Sair** continua (`logoutAction`, `variant="ghost"`, ícone `LogOut`).

A sidebar passa a receber `user: { name; username; email }` (em vez de só
`userName`) e mantém um estado local `contaOpen`.

### 4.3 Modal + formulário (`src/components/conta-modal.tsx`, `conta-form.tsx`)

- `ContaModal` envolve `Modal` (title "Minha conta") + `ContaForm`. No sucesso:
  fecha, `router.refresh()` (RF-06) e `toast.success("Conta atualizada.")`.
- `ContaForm` no padrão do `UserForm`: campos **Nome**, **Usuário (login)**
  (com sugestão a partir do nome enquanto não editado à mão, normalizando o
  input), **E-mail (opcional)**, **Nova senha (deixe em branco para manter)**.
  RHF + `zodResolver(updateOwnAccountSchema)`; `onValid` chama `updateOwnAccount`
  e mapeia `fieldErrors`/`error` para `setError`. **Sem** campos de papel/valor.

## 5. Estado e dados (CLAUDE.md §6/§7)

- Mutação por **Server Action** (`updateOwnAccount`).
- Sem React Query (não há lista a invalidar); `router.refresh()` reflete o nome.
- Formulário com **RHF + Zod**; schema é a fonte da verdade, revalidado no servidor.

## 6. Autorização

`requireUser()` (qualquer sessão válida). **Não** usa `requirePermission`/RBAC:
o autoatendimento do próprio perfil não é uma permissão de papel — é direito de
qualquer usuário sobre a própria conta. O escopo é garantido por operar só sobre
`currentUser.id`.