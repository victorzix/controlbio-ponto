# controlbio-ponto

Sistema de ponto eletrônico. **Next.js 16** (App Router) · **TypeScript** · **Drizzle ORM + PostgreSQL** · **Tailwind CSS v4 + shadcn/ui** · **motion**.

---

## ⚠️ Regras obrigatórias

Estas regras valem para **toda e qualquer** alteração. Não são sugestões.

### 1. Spec-Driven — toda feature parte do `_template`

Nada de codar direto. **Toda feature começa copiando** `docs/specs/_template/` para `docs/specs/NNN-nome-da-feature/` (número sequencial + kebab-case, ex.: `001-registro-de-ponto`).

Fluxo (ver `docs/specs/README.md`):

```
spec.md  ──►  plan.md  ──►  design.md  ──►  tasks.md  ──►  código  ──►  acceptance.md
 (o quê)     (estratégia)   (detalhe)      (execução)              (validação humana)
```

- Preencha `spec.md` e valide **antes** de avançar para o plano/design.
- Quebre o `design.md` em `tasks.md` e vá marcando conforme implementa.
- Correção simples pode viver só num `spec.md` — use bom senso, sem burocracia.
- Mantenha a spec atualizada: documento defasado é pior que ausente.

### 2. UI — Tailwind + shadcn/ui (obrigatório)

- **Todo componente de UI usa Tailwind CSS** para estilo. Sem CSS solto, sem CSS-in-JS, sem styled-components.
- **Componentes vêm do shadcn/ui.** Antes de criar um componente do zero, verifique se o shadcn já oferece (Button, Input, Dialog, Table, Form, etc.) e use-o.
  - Adicione via `npx shadcn@latest add <componente>`.
  - Componentes do shadcn ficam em `src/components/ui/` e **podem ser customizados** — são código nosso, não dependência fechada.
- Componentes próprios devem compor os primitivos do shadcn e seguir os tokens/variáveis de tema do projeto.

### 3. Animações — motion (obrigatório)

- **Toda animação usa a biblioteca [`motion`](https://motion.dev)** (sucessora do framer-motion, import via `motion/react`). Não anime com CSS keyframes manuais nem outras libs de animação.
- Use para transições de entrada/saída, microinterações, `AnimatePresence` em modais/listas, etc.
- Mantenha as animações sutis e acessíveis: respeite `prefers-reduced-motion`.

### 4. Responsividade — mobile first (obrigatório)

- **Todo desenvolvimento deste sistema é mobile first.** O ponto é batido no celular: a tela pequena é o caso primário, não a exceção. Projete e estilize primeiro para o mobile e só então amplie para telas maiores.
- **Comece pelo layout do menor breakpoint** e use os modificadores responsivos do Tailwind (`sm:`, `md:`, `lg:`, ...) para progredir — nunca o contrário (não estilize para desktop e tente "espremer" no mobile).
- **Alvos de toque ≥ 44px**, tipografia legível sem zoom, sem scroll horizontal, e nada de depender de hover para ações essenciais (não existe hover no toque).
- **Teste em viewport estreito** (≈360px) antes de considerar qualquer tela pronta. Toda tela nova/alterada deve funcionar de 360px até desktop.
- Vale para tudo: páginas, modais, tabelas (use scroll/colapso em vez de estourar a largura), formulários e navegação.

### 5. Design System — fonte da verdade em `docs/design-system.md` (obrigatório)

- **Toda UI segue `docs/design-system.md`**: paleta de cores, tipografia, espaçamento, raio, componentes e animações. Use **sempre os tokens semânticos** do tema (`bg-primary`, `text-muted-foreground`, `border-border`, ...) — **nunca** cor/raio/sombra cru no JSX ou CSS.
- **Documente o design conforme decide.** Tomou uma decisão visual nova (cor, token, padrão de componente, animação)? **Registre em `docs/design-system.md`** (na seção certa, com bump de versão/data) no mesmo PR. Mudou um token de cor → atualize a tabela **e** o `globals.css` juntos.
- A seção "Telas / UI" do `design.md` de cada feature **referencia** o design system e descreve só o que é específico daquela tela.
- Objetivo: o padrão visual é mantido por construção — qualquer pessoa (ou agente) consegue criar telas novas consistentes lendo um único documento.

### 6. Estado — React Query + Zustand (obrigatório)

Sempre que precisar de estado, use estas duas ferramentas — **sempre que possível e necessário**, não invente solução própria (nada de `useEffect` + `fetch` na mão, "context" global caseiro ou `useState` espalhado para estado compartilhado).

- **Estado de servidor (dados que vêm do back) acessado no client → [React Query](https://tanstack.com/query) (`@tanstack/react-query`).** Toda busca/cache/mutação de dados feita **no client** passa por `useQuery`/`useMutation`. O provider já existe em `src/components/providers.tsx` (montado no root layout).
  - **Exceção idiomática do App Router:** quando der para buscar no **servidor** (Server Component) ou mutar via **Server Action**, prefira isso — é o padrão do projeto e não precisa de React Query. O React Query entra quando o **client** é quem busca/sincroniza (paginação/infinite, refetch, polling, cache compartilhado entre componentes client, optimistic update).
- **Estado global de client (UI/preferências) → [Zustand](https://github.com/pmndrs/zustand).** Stores em `src/lib/stores/`. Use `persist` quando a preferência deve sobreviver entre visitas (ex.: `useSidebarStore`). Estado **efêmero e local** a um componente continua em `useState` — Zustand é para o que é **compartilhado**.
- Em SSR, cuidado com hidratação ao ler estado persistido: aplique o valor do `localStorage` só após montar (padrão usado em `app-sidebar.tsx`).

### 7. Formulários — React Hook Form + Zod (obrigatório)

**Todo formulário usa [React Hook Form](https://react-hook-form.com) com validação por [Zod](https://zod.dev)** (`@hookform/resolvers/zod`). Não controle formulário com `useState` espalhado nem dependa do reset automático da `action` do `<form>` (no React 19 isso **limpa os campos não-controlados** ao terminar a action — inclusive em erro de validação).

- **Schema Zod é a fonte da verdade** da validação, compartilhado entre client e servidor. O client valida com `zodResolver(schema)` (erro inline, sem ida ao servidor); **o servidor revalida o mesmo schema** — nunca confie no client.
- **Mutação continua via Server Action** (regra §6): o `handleSubmit(onValid)` chama a Server Action passando os dados já validados; a action revalida e retorna `{ ok }` ou `{ fieldErrors }/{ error }`, que viram `setError` no formulário. Não use `useActionState` para guardar valor de campo.
- **Erros por campo** vêm de `formState.errors`; estado de envio, de `formState.isSubmitting`. Mantenha rótulos/`aria-invalid` associados.
- Campo customizado (ex.: `markdown-editor`) integra via `<Controller>` (controlado por `value`/`onChange`).
- Padrão de referência: `src/app/(app)/ponto/ponto-form.tsx`.

---

## Convenções de código

- **TypeScript estrito.** Sem `any` sem justificativa.
- **Banco:** schema em `src/db/schema.ts`; acesso via `db` de `src/db/index.ts`. Toda mudança de schema gera migration (`npm run db:generate` → `npm run db:migrate`). Nunca edite migrations já aplicadas.
- **RBAC em código** (`src/lib/rbac.ts`): role é coluna `enum` no usuário, **não há tabela de roles**. Cheque acesso com `can()` / `assertCan()`.
- **Path alias:** `@/*` → `src/*`.
- **Idioma:** domínio, comentários e specs em **português**.

## Comandos úteis

```bash
npm run dev           # ambiente de desenvolvimento
docker compose up -d db   # sobe só o Postgres
npm run db:generate   # gera migration a partir do schema
npm run db:migrate    # aplica migrations
npm run db:studio     # Drizzle Studio (inspeção do banco)
npm run lint
```