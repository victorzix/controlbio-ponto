"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Home,
  Clock3,
  Users,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { logoutAction } from "@/lib/auth/actions";
import { useSidebarStore } from "@/lib/stores/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  userName: string;
  canVerPonto: boolean;
  canReadUsuarios: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

/** Larguras da sidebar no desktop: aberta vs. rail (recolhida). */
const WIDTH_OPEN = "md:w-64";
const WIDTH_RAIL = "md:w-16";

/**
 * Navegação principal da área interna.
 *
 * Mobile first (ver `docs/design-system.md` §9): no celular é uma barra no topo
 * com botão ☰ que abre a sidebar como **drawer** deslizante (overlay + motion);
 * a partir de `md:` vira uma sidebar **fixa** à esquerda, que pode ser
 * **recolhida para um rail de ícones** (estado persistido via Zustand).
 *
 * Animação de recolher/expandir: anima só a **largura** (`transition-[width]`)
 * com a estrutura interna **estável** — os rótulos só esmaecem por `opacity` e
 * são recortados por `overflow-hidden`, e os ícones nunca mudam de posição.
 * Assim o movimento fica fluido (sem texto piscando nem ícone "pulando").
 */
export function AppSidebar({
  userName,
  canVerPonto,
  canReadUsuarios,
}: AppSidebarProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();

  // Drawer mobile: estado efêmero, local.
  const [open, setOpen] = useState(false);

  const toggle = useSidebarStore((s) => s.toggle);
  // Estado do rail persistido (Zustand). Lido via useSyncExternalStore com
  // snapshot de servidor `false`: o HTML do servidor e o primeiro render do
  // client saem sempre "aberto" (sem mismatch de hidratação); logo após, o
  // valor real do localStorage assume e o componente re-renderiza no toggle.
  const isCollapsed = useSyncExternalStore(
    useSidebarStore.subscribe,
    () => useSidebarStore.getState().collapsed,
    () => false,
  );

  const items: NavItem[] = [
    // "Início" só para admin — funcionário não tem home (vai direto ao ponto).
    ...(canReadUsuarios ? [{ href: "/", label: "Início", icon: Home }] : []),
    ...(canVerPonto ? [{ href: "/ponto", label: "Ponto", icon: Clock3 }] : []),
    ...(canReadUsuarios
      ? [{ href: "/usuarios", label: "Usuários", icon: Users }]
      : []),
  ];

  // Enquanto o drawer está aberto: Esc fecha e o scroll do body trava.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  // Helpers de renderização (funções, não componentes — para não recriar
  // componentes a cada render). `rail` controla o estado recolhido.

  /** Marca da aplicação; `fade` a esmaece sem sair do fluxo (recorte do rail). */
  const renderBrand = (fade: boolean) => (
    <span
      className={cn(
        "font-semibold tracking-tight whitespace-nowrap text-sidebar-foreground transition-opacity duration-200",
        fade && "opacity-0",
      )}
      aria-hidden={fade || undefined}
    >
      controlbio <span className="text-muted-foreground">· ponto</span>
    </span>
  );

  /**
   * Lista de links. Layout **estável**: ícone sempre na mesma posição (`px-3`);
   * no rail o rótulo só esmaece e é recortado, com tooltip nativo (`title`).
   */
  const renderNav = (rail: boolean) => (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          aria-current={isActive(href) ? "page" : undefined}
          title={rail ? label : undefined}
          aria-label={rail ? label : undefined}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
            isActive(href)
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span
            className={cn(
              "truncate transition-opacity duration-200",
              rail && "opacity-0",
            )}
          >
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );

  /** Rodapé: ícone de sair (posição fixa) + "Sair" e nome que esmaecem no rail. */
  const renderFooter = (rail: boolean) => (
    <div className="flex h-14 items-center gap-1 border-t border-sidebar-border px-2">
      <form action={logoutAction} onSubmit={() => queryClient.clear()}>
        <Button
          type="submit"
          variant="ghost"
          className="h-11 gap-2 px-3"
          title={rail ? "Sair" : undefined}
          aria-label="Sair"
        >
          <LogOut className="size-4 shrink-0" />
          <span
            className={cn("transition-opacity duration-200", rail && "opacity-0")}
          >
            Sair
          </span>
        </Button>
      </form>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right text-sm text-muted-foreground transition-opacity duration-200",
          rail && "opacity-0",
        )}
        title={userName}
        aria-hidden={rail || undefined}
      >
        {userName}
      </span>
    </div>
  );

  return (
    <>
      {/* Sidebar fixa — desktop (md+). Recolhe para rail de ícones. */}
      <aside
        className={cn(
          "bg-sidebar hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border transition-[width] duration-300 ease-in-out md:flex",
          // Presa à viewport: altura = tela e sticky, pra o nav rolar por dentro
          // e o rodapé (logout) ficar fixo embaixo, não empurrado pelo conteúdo.
          "md:sticky md:top-0 md:h-dvh md:self-start",
          isCollapsed ? WIDTH_RAIL : WIDTH_OPEN,
        )}
      >
        {/* Cabeçalho: botão (posição fixa) + marca que esmaece */}
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={toggle}
            aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
            title={isCollapsed ? "Expandir" : "Recolher"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </Button>
          {renderBrand(isCollapsed)}
        </div>
        {renderNav(isCollapsed)}
        {renderFooter(isCollapsed)}
      </aside>

      {/* Barra superior — mobile */}
      <header className="bg-sidebar/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border px-3 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        {renderBrand(false)}
      </header>

      {/* Drawer — mobile (sempre com rótulos) */}
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            {/* Painel */}
            <motion.aside
              className="bg-sidebar absolute inset-y-0 left-0 flex w-64 flex-col shadow-xl"
              initial={reduceMotion ? { opacity: 0 } : { x: "-100%" }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
            >
              <div className="flex h-14 items-center justify-between border-b border-sidebar-border pr-2 pl-5">
                {renderBrand(false)}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Fechar menu"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-5" />
                </Button>
              </div>
              {renderNav(false)}
              {renderFooter(false)}
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
