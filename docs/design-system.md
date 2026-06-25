# Design System — controlbio-ponto

> **Fonte da verdade visual do produto.** Toda tela e todo componente seguem este documento.
> Quando uma decisão de design nova for tomada (cor, espaçamento, padrão de componente, animação),
> **registre aqui** antes/junto de implementar — é assim que mantemos o padrão (ver `CLAUDE.md` §5).

| Campo         | Valor              |
| ------------- | ------------------ |
| Versão        | 1.7                |
| Atualizado em | 2026-06-25         |
| Stack visual  | Tailwind CSS v4 · shadcn/ui (new-york) · lucide-react · motion |

---

## 1. Princípios

1. **Mobile first, sempre.** O ponto é batido no celular. Projetamos para ~360px e ampliamos
   (`CLAUDE.md` §4). Layouts simples, uma coluna no mobile, densidade maior só a partir de `md:`.
2. **Calmo e profissional.** É uma ferramenta de uso diário e com peso trabalhista — nada de visual
   "divertido" demais. Bastante respiro (whitespace), hierarquia clara, baixo ruído.
3. **Legível em qualquer luz.** Alto contraste (texto principal ≥ AA), tipografia confortável, alvos
   de toque ≥ 44px. A pessoa pode estar no sol, com pressa, na portaria.
4. **Consistência > criatividade pontual.** Use os tokens e os componentes do shadcn. Não introduza
   cor/raio/sombra fora do sistema; se precisar de algo novo, **adicione ao sistema** aqui.
5. **Acessível.** Foco visível, rótulos, `aria-*`, navegação por teclado, `prefers-reduced-motion`.

## 2. Identidade & racional

**controlbio** remete a *bio* — saúde, laboratório, vida. A cor-âncora é um **verde biotech**:
transmite confiança, vitalidade e "ok/registrado" (o verde também é o feedback natural de sucesso de
um registro de ponto). Neutros levemente esverdeados (não cinza puro) costuram a marca à interface
sem competir com o conteúdo. Vermelho/laranja ficam reservados para erro e atenção.

## 3. Base de cores

Tokens no padrão **shadcn/ui** (CSS variables em **oklch**), com tema **claro e escuro**. Os componentes
referenciam sempre o **token semântico** (`bg-primary`, `text-muted-foreground`, `border-border`, ...),
**nunca** um valor de cor cru no JSX/CSS.

> Hex ao lado é **aproximado**, só para leitura humana. O valor canônico é o oklch.

### Tema claro (`:root`)

| Token                      | oklch                        | ~Hex      | Uso |
| -------------------------- | ---------------------------- | --------- | --- |
| `--background`             | `oklch(0.99 0.005 160)`      | `#FBFDFC` | Fundo da página |
| `--foreground`            | `oklch(0.21 0.02 165)`       | `#1E2A25` | Texto principal |
| `--card`                   | `oklch(1 0 0)`               | `#FFFFFF` | Superfície de cartões |
| `--card-foreground`        | `oklch(0.21 0.02 165)`       | `#1E2A25` | Texto em cartões |
| `--popover`                | `oklch(1 0 0)`               | `#FFFFFF` | Popovers/menus |
| `--popover-foreground`     | `oklch(0.21 0.02 165)`       | `#1E2A25` | Texto em popovers |
| `--primary`                | `oklch(0.60 0.128 163)`      | `#159A6B` | **Verde da marca** — ações primárias, foco |
| `--primary-foreground`     | `oklch(0.985 0.01 160)`      | `#FAFEFC` | Texto sobre primary |
| `--secondary`              | `oklch(0.96 0.01 160)`       | `#F1F4F3` | Botões/superfícies secundárias |
| `--secondary-foreground`   | `oklch(0.27 0.02 165)`       | `#2C3B35` | Texto sobre secondary |
| `--muted`                  | `oklch(0.96 0.01 160)`       | `#F1F4F3` | Fundos sutis |
| `--muted-foreground`       | `oklch(0.52 0.02 165)`       | `#6B7A73` | Texto secundário/placeholder |
| `--accent`                 | `oklch(0.95 0.03 162)`       | `#E6F3EC` | Hover/realce sutil |
| `--accent-foreground`      | `oklch(0.27 0.02 165)`       | `#2C3B35` | Texto sobre accent |
| `--destructive`            | `oklch(0.58 0.22 27)`        | `#D23F3F` | Erro/exclusão |
| `--destructive-foreground` | `oklch(0.985 0 0)`           | `#FCFCFC` | Texto sobre destructive |
| `--border`                 | `oklch(0.91 0.01 160)`       | `#E2E7E5` | Bordas |
| `--input`                  | `oklch(0.91 0.01 160)`       | `#E2E7E5` | Borda de inputs |
| `--ring`                   | `oklch(0.60 0.128 163)`      | `#159A6B` | Anel de foco (verde da marca) |
| `--radius`                 | `0.625rem` (10px)            | —         | Raio base |
| `--sidebar`                | `oklch(0.98 0.008 162)`      | `#F7FAF8` | Fundo da sidebar |
| `--sidebar-foreground`     | `oklch(0.21 0.02 165)`       | `#1E2A25` | Texto da sidebar |
| `--sidebar-primary`        | `oklch(0.60 0.128 163)`      | `#159A6B` | Realce/marca na sidebar |
| `--sidebar-primary-foreground` | `oklch(0.985 0.01 160)`  | `#FAFEFC` | Texto sobre sidebar-primary |
| `--sidebar-accent`         | `oklch(0.95 0.03 162)`       | `#E6F3EC` | Item ativo / hover |
| `--sidebar-accent-foreground` | `oklch(0.27 0.02 165)`    | `#2C3B35` | Texto do item ativo |
| `--sidebar-border`         | `oklch(0.91 0.01 160)`       | `#E2E7E5` | Bordas da sidebar |
| `--sidebar-ring`           | `oklch(0.60 0.128 163)`      | `#159A6B` | Foco na sidebar |

### Tema escuro (`.dark`)

| Token                      | oklch                        | ~Hex      |
| -------------------------- | ---------------------------- | --------- |
| `--background`             | `oklch(0.17 0.015 165)`      | `#15201B` |
| `--foreground`            | `oklch(0.97 0.01 160)`       | `#F2F6F4` |
| `--card`                   | `oklch(0.21 0.02 165)`       | `#1E2A25` |
| `--card-foreground`        | `oklch(0.97 0.01 160)`       | `#F2F6F4` |
| `--popover`                | `oklch(0.21 0.02 165)`       | `#1E2A25` |
| `--popover-foreground`     | `oklch(0.97 0.01 160)`       | `#F2F6F4` |
| `--primary`                | `oklch(0.70 0.13 163)`       | `#2FBE86` |
| `--primary-foreground`     | `oklch(0.18 0.02 165)`       | `#18231E` |
| `--secondary`              | `oklch(0.27 0.02 165)`       | `#2C3B35` |
| `--secondary-foreground`   | `oklch(0.97 0.01 160)`       | `#F2F6F4` |
| `--muted`                  | `oklch(0.27 0.02 165)`       | `#2C3B35` |
| `--muted-foreground`       | `oklch(0.70 0.02 165)`       | `#9FB0A8` |
| `--accent`                 | `oklch(0.30 0.03 163)`       | `#2E4138` |
| `--accent-foreground`      | `oklch(0.97 0.01 160)`       | `#F2F6F4` |
| `--destructive`            | `oklch(0.70 0.19 25)`        | `#E8654F` |
| `--destructive-foreground` | `oklch(0.985 0 0)`           | `#FCFCFC` |
| `--border`                 | `oklch(1 0 0 / 10%)`         | —         |
| `--input`                  | `oklch(1 0 0 / 15%)`         | —         |
| `--ring`                   | `oklch(0.70 0.13 163)`       | `#2FBE86` |
| `--sidebar`                | `oklch(0.19 0.02 165)`       | `#1A2620` |
| `--sidebar-foreground`     | `oklch(0.97 0.01 160)`       | `#F2F6F4` |
| `--sidebar-primary`        | `oklch(0.70 0.13 163)`       | `#2FBE86` |
| `--sidebar-primary-foreground` | `oklch(0.18 0.02 165)`   | `#18231E` |
| `--sidebar-accent`         | `oklch(0.30 0.03 163)`       | `#2E4138` |
| `--sidebar-accent-foreground` | `oklch(0.97 0.01 160)`    | `#F2F6F4` |
| `--sidebar-border`         | `oklch(1 0 0 / 10%)`         | —         |
| `--sidebar-ring`           | `oklch(0.70 0.13 163)`       | `#2FBE86` |

> **Sidebar adotada (v1.3):** os tokens `--sidebar-*` acima já estão no `globals.css` e mapeados no
> `@theme` (utilities `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `border-sidebar-border`,
> ...). Ver §9. **Charts:** quando entrarem gráficos, usar `--chart-1..5` (verde como `--chart-1`) e
> documentar aqui ao adotar.

## 4. Tipografia

- **Fonte de UI:** **Geist Sans** (`--font-geist-sans`), já carregada via `next/font`. **Mono:** Geist Mono
  (números de relógio, durações, IDs).
- **Escala (mobile → desktop):**
  - Título de tela: `text-2xl font-semibold` → `sm:text-3xl`.
  - Título de card/seção: `text-lg font-semibold`.
  - Corpo: `text-sm` (mobile) / `text-base` (desktop quando couber).
  - Auxiliar/legenda: `text-xs text-muted-foreground`.
- **Peso:** regular para corpo, `font-medium`/`font-semibold` para ênfase e botões. Evitar `font-bold` pesado.

## 5. Espaçamento, raio e elevação

- **Escala de espaço:** múltiplos de 4 do Tailwind. Padding de card: `p-6` (mobile pode `p-5`).
  Gap entre campos de formulário: `gap-4`. Margem entre seções: `space-y-6`.
- **Raio:** `--radius` = 10px. Botões/inputs/cards usam o raio do tema (`rounded-md`/`rounded-lg` via shadcn).
- **Elevação:** sombras sutis (`shadow-sm`/`shadow`); o produto é "flat" com profundidade leve. Evitar sombras dramáticas.
- **Largura de leitura:** formulários e cards centrais limitam a `max-w-sm`/`max-w-md`; conteúdo de
  listas usa container responsivo.

## 6. Componentes (shadcn/ui)

- **Origem:** estilo **new-york**. Componentes vivem em `src/components/ui/` e podem ser customizados.
- **Em uso:** `button`, `input`, `label`, `card`, `sonner` (toasts), `table`, `badge`, `markdown` (próprio),
  `modal` (próprio), `calendar` (react-day-picker), `date-field` (próprio), `date-range-field` (próprio),
  `currency-input` (próprio).
- **Como adicionar componentes:** o ideal é `npx shadcn@latest add <componente>`. **Porém o CLI/registry
  trava neste ambiente** — quando for um componente **puro** (só usa `cn`, sem dependência npm nova, ex.:
  `table`, `badge`, `separator`), escreva o arquivo à mão no estilo new-york em vez de bloquear no CLI.
  Componentes que exigem dep nova (radix: `dialog`, `select`, `dropdown-menu`, ...) ficam para quando der
  para instalar — veja a alternativa de `<select>` nativo abaixo.
- **Botões:** primário = `variant="default"` (verde). Destrutivo = `variant="destructive"`. Neutro =
  `variant="secondary"`/`"outline"`/`"ghost"`. Altura mínima `h-11` em ações principais no mobile (toque).
- **Inputs:** sempre com `<Label>` associada. Erro: `aria-invalid` + mensagem em `text-destructive text-sm`.
- **Select:** preferimos **`<select>` nativo** estilizado com os tokens (ótimo no mobile — usa o seletor
  do SO — e sem dependência). O `select` do shadcn (radix) só quando houver necessidade real de
  customização avançada.
- **Modal/Diálogo:** componente **próprio** `src/components/ui/modal.tsx`, feito com `motion` (sem radix —
  o registry trava; ver acima). No **mobile** é um **bottom sheet** que sobe (`items-end`, cantos
  arredondados no topo); a partir de `sm:` fica **centralizado** (`max-w-lg`). Fecha no ✕, no backdrop e
  no **Esc**; trava o scroll do body, faz **trap de foco** e **devolve o foco** ao fechar; conteúdo
  montado só enquanto aberto (cada abertura começa limpa). **Use para formulários de criação/edição
  curtos** em vez de uma página nova — padrão em **/ponto** ("Novo registro"). Mutação continua via
  **Server Action**; no sucesso o cliente fecha o modal e dá `router.refresh()` (ver `CLAUDE.md` §6).
- **Data:** componente `date-field` (`src/components/ui/date-field.tsx`) — botão com a data **por extenso**
  que abre um `calendar` (`src/components/ui/calendar.tsx`, **react-day-picker** em pt-BR, tematizado pelos
  tokens via CSS vars do rdp em `globals.css`; título centralizado, setas ← → nas pontas, dia selecionado
  em quadrado verde). react-day-picker é lib **externa** (não-radix), ok de usar. O calendário é um
  **popover flutuante** renderizado em **portal** no `body` com posição `fixed` ancorada no campo (z-index
  acima do modal) — assim fica por cima e **não** é cortado pelo overflow do modal nem empurra os campos;
  reposiciona ao rolar/redimensionar e fecha ao escolher/Esc/clicar fora. Controlado via RHF
  `<Controller>`. Não use `<input type="date">` cru.
- **Valor em R$:** componente `currency-input` (`src/components/ui/currency-input.tsx`) — prefixo "R$" e
  **vírgula automática** (digita só números, centavos preenchem da direita: `5000` → `50,00`). Controlado,
  guarda o valor em **reais** (número); use via RHF `<Controller>`. Usado no valor/hora do usuário.
- **Intervalo de datas:** `date-range-field` (`src/components/ui/date-range-field.tsx`) — botão
  "DD/MM – DD/MM" que abre o `calendar` em **modo range** (mesmo popover via portal do `date-field`).
- **Segmented control (abas curtas):** para alternar entre poucas opções (ex.: período Semana/Mês/Intervalo),
  use um grupo de pílulas: container `bg-muted rounded-lg p-1` e a opção ativa `bg-background shadow-sm`
  (inativa `text-muted-foreground`), com `role="tablist"`/`role="tab"`. Mais bonito que `<select>` para
  2–4 opções. Padrão no filtro de `/ponto`.
- **Tabelas:** `Table` do shadcn no desktop; no **mobile**, prefira lista de **cards** (uma coluna) em vez
  de espremer a tabela. Padrão usado em `/usuarios`.
- **Badge:** status/rótulos curtos. Convenção: ativo = `secondary`/`default`; inativo/neutro = `outline`;
  erro/alerta = `destructive`.
- **Rich text:** padrão **Markdown**. Edição via textarea + mini-toolbar (negrito/itálico/link/lista) +
  preview; exibição via componente próprio `<Markdown>` (`components/ui/markdown.tsx`), que é **seguro por
  construção** (monta nós React, sem `dangerouslySetInnerHTML`; links só com esquema `http(s)`/`mailto`).
  Subset: negrito, itálico, código, links, listas, parágrafos. Não usamos editores WYSIWYG/libs externas.
- **Formulários:** padrão `useActionState` + Server Action (sem react-hook-form). Erros por campo inline.
- **Feedback:** usar `sonner` (toast) para sucesso/erro de ações; erro de formulário inline abaixo do campo.
- **Ícones:** `lucide-react`, tamanho `size-4`/`size-5`, cor herdada (`text-current`/`text-muted-foreground`).

## 7. Animações (motion)

- Biblioteca **`motion`** (`motion/react`) — `CLAUDE.md` §3. Sutis e rápidas.
- **Durações:** 150–250ms para microinterações; até ~300ms para entrada de containers.
- **Easing:** `ease-out` para entradas; evitar bounces exagerados.
- **Padrões:** entrada de card/modal com `opacity` + `y` (8–12px); listas com `AnimatePresence`;
  feedback de toque com leve `scale` (0.98) no `whileTap`.
- **Acessibilidade:** respeitar `prefers-reduced-motion` (reduzir/escalar para fade simples ou nenhum
  movimento). Centralizar isso num helper quando houver repetição.

## 8. Responsividade (resumo operacional)

- Breakpoints Tailwind: base (mobile) → `sm` 640 → `md` 768 → `lg` 1024 → `xl` 1280.
- **Regra:** estilize a base para mobile; adicione `sm:`/`md:`/... para telas maiores. Nunca o inverso.
- Sem scroll horizontal. Tabelas largas: scroll interno ou colapso em cards no mobile.
- Testar a ~360px antes de dar a tela como pronta.

## 9. Navegação (sidebar)

A navegação da área interna é uma **sidebar** (`src/components/app-sidebar.tsx`), montada à mão
(compondo primitivos + `motion`) em vez do componente pesado do shadcn — que depende de radix e o
registry trava neste ambiente (ver §6).

- **Mobile first.** No celular é uma **barra fixa no topo** (`h-14`, `sticky`, `backdrop-blur`) com
  botão **☰** que abre a sidebar como **drawer** deslizante da esquerda, com overlay escuro
  (`bg-black/50`). A partir de `md:` a sidebar é **fixa** à esquerda (`w-64`), e o conteúdo fica ao lado.
- **Recolhível (desktop).** Um botão no topo da sidebar (`PanelLeftClose`/`PanelLeftOpen`) a recolhe
  para um **rail de ícones** (`w-16`): o texto dos itens, da marca e o nome do usuário **esmaece**
  (`opacity`), enquanto os ícones ficam **fixos** na mesma posição (`px-3`) e ganham **tooltip nativo**
  (atributo `title`). Para a animação ficar **fluida**, anima-se só a **largura**
  (`transition-[width] duration-300 ease-in-out`) com a estrutura interna estável e `overflow-hidden`
  recortando os rótulos — nada de montar/desmontar conteúdo nem trocar alinhamento no meio da transição
  (isso causa "piscada"/"pulo"). O estado fica em **Zustand persistido** (`useSidebarStore`,
  `src/lib/stores/sidebar.ts`) — lembra a preferência entre visitas. Ler o valor com
  `useSyncExternalStore` (snapshot de servidor `false`) para não divergir do HTML do servidor.
- **Cores.** Usa os tokens `--sidebar-*` (§3): fundo `bg-sidebar`, texto `text-sidebar-foreground`,
  **item ativo/hover** em `bg-sidebar-accent` / `text-sidebar-accent-foreground`, divisórias
  `border-sidebar-border`. Item inativo usa `text-sidebar-foreground/70`.
- **Item ativo.** Determinado pela rota atual (`usePathname`): exato para `/`, `startsWith` para as
  demais. Marca-se com `aria-current="page"`.
- **Toque & a11y.** Itens e botões com alvo ≥ 44px (`min-h-[44px]`, ícones em `size-11`). O drawer é
  `role="dialog"`/`aria-modal`, fecha ao **navegar**, ao tocar no overlay, no **✕** e com **Esc**;
  trava o scroll do body enquanto aberto.
- **Animação (`motion`).** Drawer entra/sai com `x: -100% → 0` (overlay com fade), `~250ms ease-out`,
  via `AnimatePresence`. Respeita `prefers-reduced-motion` (cai para fade simples) — ver §7.
- **Rodapé.** Nome do usuário (truncado) + botão **Sair** (`logoutAction`, `variant="ghost"`).

## 10. Como evoluir este documento

1. Tomou uma decisão visual nova (cor, token, padrão, animação)? **Documente aqui** na seção certa e
   bump a versão/data no topo.
2. Mudou um token de cor? Atualize a tabela **e** o `globals.css` no mesmo PR.
3. A seção "Telas / UI" do `design.md` de cada feature deve **referenciar** este documento e registrar
   só o que é específico daquela tela.
