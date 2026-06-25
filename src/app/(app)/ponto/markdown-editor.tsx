"use client";

import * as React from "react";
import { Bold, Italic, Link2, List } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

type Props = {
  /** Controlado: valor atual e callback de mudança (integra com RHF Controller). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
};

const TOOL_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/**
 * Editor de Markdown **controlado**: textarea + mini-toolbar (negrito/itálico/
 * link/lista) e abas Escrever/Visualizar. O preview usa o mesmo renderer seguro
 * `<Markdown>`. O valor é gerenciado pelo pai (RHF via `<Controller>`).
 */
export function MarkdownEditor({
  value,
  onChange,
  id = "description",
  ariaInvalid,
  ariaDescribedby,
}: Props) {
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after: string, placeholder: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + selected + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  function linePrefix(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  return (
    <div
      className={cn(
        "border-input rounded-md border",
        ariaInvalid && "border-destructive",
      )}
    >
      <div className="border-border flex items-center gap-1 border-b p-1">
        <button
          type="button"
          className={TOOL_BTN}
          onClick={() => wrap("**", "**", "negrito")}
          aria-label="Negrito"
          title="Negrito"
        >
          <Bold className="size-4" />
        </button>
        <button
          type="button"
          className={TOOL_BTN}
          onClick={() => wrap("*", "*", "itálico")}
          aria-label="Itálico"
          title="Itálico"
        >
          <Italic className="size-4" />
        </button>
        <button
          type="button"
          className={TOOL_BTN}
          onClick={() => wrap("[", "](https://)", "texto")}
          aria-label="Link"
          title="Link"
        >
          <Link2 className="size-4" />
        </button>
        <button
          type="button"
          className={TOOL_BTN}
          onClick={() => linePrefix("- ")}
          aria-label="Lista"
          title="Lista"
        >
          <List className="size-4" />
        </button>

        <div className="ml-auto flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setTab("write")}
            aria-pressed={tab === "write"}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              tab === "write"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Escrever
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            aria-pressed={tab === "preview"}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              tab === "preview"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Visualizar
          </button>
        </div>
      </div>

      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedby}
        placeholder="Descreva o que foi feito. Dá pra usar **negrito**, *itálico*, [links](https://...) e listas com -"
        className={cn(
          "placeholder:text-muted-foreground w-full resize-y bg-transparent p-3 text-sm outline-none",
          tab === "preview" && "hidden",
        )}
      />

      {tab === "preview" ? (
        <div className="min-h-[8.5rem] p-3">
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <p className="text-muted-foreground text-sm">Nada para visualizar ainda.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
