"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type CurrencyInputProps = {
  /** Valor em reais (número). `undefined` = vazio. */
  value?: number;
  onChange: (value: number | undefined) => void;
  id?: string;
  placeholder?: string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
};

/**
 * Input de valor em **R$** com vírgula automática: digita-se só números e os
 * centavos preenchem da direita (ex.: `5000` → `50,00`, `1234567` → `12.345,67`).
 * Controlado — guarda o valor em **reais** (número). Use via RHF `<Controller>`.
 */
export function CurrencyInput({
  value,
  onChange,
  id,
  placeholder = "0,00",
  ariaInvalid,
  ariaDescribedby,
}: CurrencyInputProps) {
  const display = value == null ? "" : fmt.format(value);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits === "") {
      onChange(undefined);
      return;
    }
    // Os dígitos representam centavos; vira reais dividindo por 100.
    onChange(Number.parseInt(digits, 10) / 100);
  }

  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
        R$
      </span>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder}
        onChange={handleChange}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedby}
        className={cn("pl-9", ariaInvalid && "border-destructive")}
      />
    </div>
  );
}
