"use client";

import "react-day-picker/style.css";
import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendário do projeto — [react-day-picker](https://daypicker.dev) em pt-BR.
 *
 * Visual: título do mês centralizado, setas (← →) nas pontas, dia selecionado em
 * quadrado arredondado (verde da marca). Usa o CSS base da lib + tema via CSS
 * vars do rdp (classe `.rdp-controlbio` em `globals.css`), adaptando a
 * claro/escuro pelos tokens. Ver `docs/design-system.md` §6.
 */
export function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={ptBR}
      className={cn("rdp-controlbio", className)}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ArrowLeft className="size-4" />
          ) : (
            <ArrowRight className="size-4" />
          ),
      }}
      {...props}
    />
  );
}
