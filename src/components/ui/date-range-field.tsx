"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const CAL_WIDTH = 300;
const CAL_HEIGHT = 380;

type DateRangeFieldProps = {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  id?: string;
};

/**
 * Seletor de **intervalo** de datas: botão com "DD/MM – DD/MM" que abre um
 * `Calendar` em modo range (popover flutuante via portal). Escolhe-se início e
 * fim no mesmo calendário; ao completar o intervalo, fecha.
 */
export function DateRangeField({ from, to, onChange, id }: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const reduceMotion = useReducedMotion();
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function computeCoords() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return null;
    const margin = 8;
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
    // Começa a seleção do zero: 1º clique = início, 2º clique = fim. Assim o
    // react-day-picker não "completa" um range já preenchido no primeiro clique.
    setRange(undefined);
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

  // Controle manual dos cliques: 1º define o início (to indefinido); 2º fecha o
  // intervalo (ordenando início/fim) e confirma. Evita o auto-range do rdp que
  // completava tudo no primeiro clique.
  function handleDayClick(day: Date) {
    if (!range?.from || range.to) {
      setRange({ from: day, to: undefined });
      return;
    }
    let start = range.from;
    let end = day;
    if (end.getTime() < start.getTime()) {
      [start, end] = [end, start];
    }
    setRange({ from: start, to: end });
    onChange({ from: toISO(start), to: toISO(end) });
    setOpen(false);
  }

  const label =
    from && to ? `${formatBR(from)} – ${formatBR(to)}` : "Selecione o período";

  return (
    <div ref={triggerRef} className="w-full sm:w-auto">
      <Button
        type="button"
        variant="outline"
        id={id}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="h-9 w-full justify-start gap-2 font-normal sm:w-64"
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
                  aria-label="Escolher período"
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
                    mode="range"
                    selected={range}
                    defaultMonth={from ? parseLocalDate(from) : undefined}
                    onDayClick={handleDayClick}
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
