import { cn } from "@/lib/utils";

/**
 * Avatar de **iniciais** — componente próprio e puro (só `cn`, sem radix: o
 * avatar do shadcn depende de radix e o registry trava neste ambiente, ver
 * `docs/design-system.md` §6). Renderiza um círculo com 1–2 letras do nome.
 *
 * Por padrão usa os tokens da sidebar; passe `className` para outro tamanho/cor.
 */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Iniciais: primeira letra do primeiro e do último token do nome (1–2 letras). */
function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  const first = tokens[0][0] ?? "";
  const last = tokens.length > 1 ? (tokens[tokens.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}