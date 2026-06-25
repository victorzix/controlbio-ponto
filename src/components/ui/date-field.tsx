"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Parse "YYYY-MM-DD" como data local (evita shift de fuso). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date local → "YYYY-MM-DD". */
function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const labelFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

type Coords = { top: number; left: number };

type DateFieldProps = {
  /** Valor controlado em "YYYY-MM-DD". */
  value: string;
  onChange: (iso: string) => void;
  /** Data máxima selecionável (YYYY-MM-DD). */
  max?: string;
  id?: string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
};

const CAL_WIDTH = 300;
const CAL_HEIGHT = 360;

/**
 * Campo de data: botão com a data por extenso que abre um `Calendar` como
 * **popover flutuante** — renderizado em portal no `body` com posição `fixed`
 * ancorada no campo, então fica **por cima** do conteúdo (não é cortado pelo
 * overflow do modal nem empurra os outros campos). Reposiciona ao rolar/redimensionar
 * e fecha ao escolher, no Esc ou ao clicar fora. Controlado (RHF via `<Controller>`).
 */
export function DateField({
  value,
  onChange,
  max,
  id,
  ariaInvalid,
  ariaDescribedby,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const reduceMotion = useReducedMotion();
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = value ? parseLocalDate(value) : undefined;
  const maxDate = max ? parseLocalDate(max) : undefined;

  function computeCoords(): Coords | null {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return null;
    const margin = 8;
    // Abre abaixo; se não couber e couber acima, abre acima.
    const openAbove =
      r.bottom + CAL_HEIGHT + margin > window.innerHeight &&
      r.top - CAL_HEIGHT - margin > 0;
    const top = openAbove ? r.top - CAL_HEIGHT - margin : r.bottom + margin;
    let left = r.left;
    if (left + CAL_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - CAL_WIDTH - margin;
    }
    if (left < margin) left = margin;
    return { top, left };
  }

  function openPicker() {
    setCoords(computeCoords());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() {
      setCoords(computeCoords());
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const label = selected
    ? labelFmt.format(selected).replace(/^\w/, (c) => c.toUpperCase())
    : "Selecione a data";

  return (
    <div ref={triggerRef}>
      <Button
        type="button"
        variant="outline"
        id={id}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedby}
        className={cn(
          "h-9 w-full justify-start gap-2 font-normal",
          !selected && "text-muted-foreground",
          ariaInvalid && "border-destructive",
        )}
      >
        <CalendarDays className="text-muted-foreground size-4 shrink-0" />
        <span>{label}</span>
      </Button>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open && coords ? (
                <motion.div
                  ref={popoverRef}
                  role="dialog"
                  aria-label="Escolher data"
                  style={{
                    position: "fixed",
                    top: coords.top,
                    left: coords.left,
                    zIndex: 60,
                  }}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="bg-popover text-popover-foreground rounded-lg border border-border shadow-lg"
                >
                  <Calendar
                    mode="single"
                    required
                    selected={selected}
                    defaultMonth={selected ?? maxDate}
                    onSelect={(d) => {
                      if (d) {
                        onChange(toISO(d));
                        setOpen(false);
                      }
                    }}
                    disabled={maxDate ? { after: maxDate } : undefined}
                    autoFocus
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
