"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { createEntry, type PontoActionState } from "@/lib/ponto/actions";
import { MarkdownEditor } from "./markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Salvando..." : "Salvar registro"}
    </Button>
  );
}

export function PontoForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<PontoActionState, FormData>(
    createEntry,
    {},
  );
  const reduceMotion = useReducedMotion();
  const fe = state.fieldErrors ?? {};

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full max-w-lg"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Novo registro</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4" noValidate>
            {state.error ? (
              <p role="alert" className="text-destructive text-sm">
                {state.error}
              </p>
            ) : null}

            {/* Dia */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="workDate">Dia</Label>
              <Input
                id="workDate"
                name="workDate"
                type="date"
                defaultValue={today}
                max={today}
                aria-invalid={!!fe.workDate || undefined}
                aria-describedby={fe.workDate ? "workDate-error" : undefined}
                required
              />
              {fe.workDate ? (
                <p id="workDate-error" className="text-destructive text-sm">
                  {fe.workDate}
                </p>
              ) : null}
            </div>

            {/* Tempo trabalhado */}
            <div className="flex flex-col gap-2">
              <Label>Tempo trabalhado</Label>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="hours"
                    className="text-muted-foreground text-xs font-normal"
                  >
                    Horas
                  </Label>
                  <Input
                    id="hours"
                    name="hours"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={24}
                    defaultValue="0"
                    className="w-24"
                    aria-invalid={!!fe.hours || undefined}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="minutes"
                    className="text-muted-foreground text-xs font-normal"
                  >
                    Minutos
                  </Label>
                  <Input
                    id="minutes"
                    name="minutes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    defaultValue="0"
                    className="w-24"
                    aria-invalid={!!fe.minutes || undefined}
                  />
                </div>
              </div>
              {fe.hours ? (
                <p className="text-destructive text-sm">{fe.hours}</p>
              ) : null}
              {fe.minutes ? (
                <p className="text-destructive text-sm">{fe.minutes}</p>
              ) : null}
            </div>

            {/* Descrição */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Descrição</Label>
              <MarkdownEditor
                name="description"
                ariaInvalid={!!fe.description}
                ariaDescribedby={fe.description ? "description-error" : undefined}
              />
              {fe.description ? (
                <p id="description-error" className="text-destructive text-sm">
                  {fe.description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <SubmitButton />
              <Button asChild variant="outline" className="h-11 w-full">
                <Link href="/ponto">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
