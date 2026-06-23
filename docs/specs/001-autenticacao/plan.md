# Plan — Autenticação

> **Camada 2 — A ESTRATÉGIA TÉCNICA.** Como vamos atacar os requisitos do `spec.md`.
> Decisões de alto nível, não detalhes de implementação (esses vão no `design.md`).

## 1. Visão Geral da Abordagem

Autenticação **própria, baseada em sessão no servidor** (server-side sessions), não em JWT stateless.
O fluxo: a pessoa envia e-mail/senha por uma **Server Action**, o servidor verifica o *hash* da senha,
cria uma **sessão persistida no banco** e devolve um **cookie opaco** (`HttpOnly`). A cada requisição,
um helper `getSession()` resolve o usuário a partir do cookie. Uma **middleware** redireciona visitantes
anônimos para o login de forma otimista; a checagem autoritativa acontece no *layout* da área interna
(Server Component).

Escolhemos sessão no servidor porque ponto eletrônico exige **revogação imediata** (logout e desativação
de conta valem na hora) e rastreabilidade — algo que JWT puro não entrega bem.

## 2. Componentes Afetados

| Componente / Módulo                    | Tipo de mudança | Observação                                                        |
| -------------------------------------- | --------------- | ----------------------------------------------------------------- |
| Banco — tabela `sessions`              | Novo            | Sessões persistidas; FK para `users`. Migration nova.             |
| `src/lib/auth/` (hash, sessão, helpers)| Novo            | Núcleo de autenticação (hashing, criar/validar/revogar sessão).   |
| `src/lib/auth/actions.ts` (login/logout)| Novo           | Server Actions de login e logout.                                 |
| `src/middleware.ts`                    | Novo            | Redirecionamento otimista de rotas protegidas.                    |
| `src/app/(auth)/login`                 | Novo            | Tela de login (rota pública).                                     |
| `src/app/(app)/layout.tsx`             | Novo            | Layout da área interna com guarda autoritativa de sessão.         |
| `src/app/page.tsx` / estrutura de rotas| Alterado        | Reorganizar em *route groups* `(auth)` e `(app)`.                 |
| shadcn/ui                              | Novo (setup)    | Inicializar shadcn e adicionar `button`, `input`, `label`, `card`, `form`, `sonner`. |
| `src/db/seed.ts`                       | Novo            | *Seed* do admin inicial via variáveis de ambiente.                |
| `.env` / `.env.example`                | Alterado        | `AUTH_SECRET`, `SESSION_MAX_AGE` (já previstos) + credenciais do admin seed. |

## 3. Stack & Dependências

- **Linguagem / Framework:** TypeScript + Next.js 16 (App Router, Server Actions, Server Components).
- **Banco / Persistência:** PostgreSQL via Drizzle ORM (tabela `sessions`).
- **Hashing de senha:** **`node:crypto` (scrypt)** — built-in do Node, sem dependência nativa nem
  problema de compilação no Windows. *Salt* aleatório por usuário, comparação em tempo constante.
- **Bibliotecas novas:**
  - `zod` — validação dos campos do formulário (e-mail/senha) no servidor.
  - `shadcn/ui` (+ `lucide-react`, `class-variance-authority`, `tailwind-merge`, `clsx`, `sonner`) —
    componentes de UI exigidos pelo `CLAUDE.md`.
  - `motion` — animações da tela de login (exigido pelo `CLAUDE.md`).
- **Serviços externos:** nenhum.

## 4. Decisões Técnicas (ADRs resumidas)

| Decisão                       | Opção escolhida                  | Alternativas consideradas              | Por quê |
| ----------------------------- | -------------------------------- | -------------------------------------- | ------- |
| Modelo de sessão              | Sessão no servidor (DB) + cookie opaco | JWT stateless; Auth.js (NextAuth)  | Revogação imediata e rastreabilidade; controle total e dependência mínima para um escopo simples (e-mail/senha). |
| Hash de senha                 | `scrypt` (node:crypto)           | bcryptjs (puro, mais lento/fraco); argon2/`@node-rs/argon2` (nativo) | Forte, built-in, **zero dependência nativa** — evita dor de build no Windows. |
| Token de sessão               | Aleatório (256 bits), guardado **hasheado** no banco | Token em texto puro no banco | Vazamento do banco não permite forjar sessões. |
| Transporte da sessão          | Cookie `HttpOnly`/`SameSite=Lax`/`Secure` | localStorage | Imune a XSS de leitura; enviado automaticamente; padrão para apps server-rendered. |
| Proteção de rotas             | Middleware otimista + guarda autoritativa no layout | Só middleware (com DB no edge) | Middleware no edge não acessa bem o Postgres; validação real fica no Server Component. |
| Validação de entrada          | `zod`                            | validação manual                        | Schema declarativo, mensagens consistentes, reuso cliente/servidor. |

## 5. Impactos

- **Migração de dados:** nova tabela `sessions` (migration aditiva, não destrutiva). `users` não muda.
- **Compatibilidade:** projeto ainda *greenfield*; reorganizar `src/app` em *route groups* não quebra nada em produção.
- **Integrações:** estabelece o helper `getCurrentUser()` que **todas as features seguintes** vão consumir
  para autorização (combinado com `can()`/`assertCan()` do RBAC).

## 6. Riscos & Mitigações

| Risco                                              | Probabilidade | Impacto | Mitigação                                                            |
| -------------------------------------------------- | ------------- | ------- | ------------------------------------------------------------------- |
| `scrypt` mal parametrizado (custo baixo)           | Baixa         | Alto    | Usar parâmetros recomendados (N=2^16) e formato `salt:hash` versionável. |
| Acesso ao banco na middleware (edge)               | Média         | Médio   | Middleware só inspeciona presença do cookie; validação real no layout. |
| Sessões órfãs/expiradas acumulando no banco        | Média         | Baixo   | `expiresAt` indexado + limpeza preguiçosa na validação (e rotina futura). |
| Vazamento de credenciais do admin seed             | Baixa         | Alto    | Credenciais só via env; trocar senha no primeiro acesso (recomendação). |
| Fixação de sessão                                  | Baixa         | Médio   | Gerar token novo a cada login; nunca reaproveitar identificador.    |

## 7. Estratégia de Testes

- **Unitários:** hashing (hash/verify, senha errada, *salt* distinto por usuário); criação/validação/
  expiração/revogação de sessão; validação `zod` do formulário.
- **Integração:** Server Action de login (sucesso, senha errada, e-mail inexistente, conta inativa,
  sessão expirada); logout invalida a sessão; guarda de rota redireciona anônimo.
- **Aceitação:** roteiro manual em `acceptance.md`, mapeado 1:1 contra os CA da spec, incluindo o
  teste de viewport mobile (CA-07).

## 8. Plano de Rollout

- Sem *feature flag* — é fundação, entra direto na branch principal.
- Ordem: migration `sessions` → núcleo de auth → middleware/layout → UI de login → *seed* admin.
- **Rollback:** reverter migration da tabela `sessions` e remover as rotas; `users` permanece intacta.

## 9. Estimativa & Marcos

| Marco   | Entrega                                                       | Estimativa |
| ------- | ------------------------------------------------------------- | ---------- |
| Marco 1 | Schema `sessions` + núcleo de auth (hash + sessão) testados   | ~0,5 dia   |
| Marco 2 | Server Actions de login/logout + guarda de rotas              | ~0,5 dia   |
| Marco 3 | Setup shadcn/ui + tela de login mobile first com motion       | ~0,5 dia   |
| Marco 4 | Seed do admin + aceitação manual (CA-01..08)                  | ~0,5 dia   |