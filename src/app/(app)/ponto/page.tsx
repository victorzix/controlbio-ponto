import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listOwnEntries } from "@/lib/ponto/data";
import { formatWorkedMinutes } from "@/lib/ponto/validation";
import { Markdown } from "@/components/ui/markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PontoToast } from "./ponto-toast";

/** Formata YYYY-MM-DD como DD/MM/AAAA sem passar por Date (evita fuso). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type PageProps = {
  searchParams: Promise<{ ok?: string }>;
};

export default async function PontoPage({ searchParams }: PageProps) {
  const user = await requirePermission("ponto:ver_proprio");
  const { ok } = await searchParams;
  const entries = await listOwnEntries(user.id);

  return (
    <div className="space-y-6">
      {ok ? <PontoToast ok={ok} /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Meus registros
        </h1>
        <Button asChild>
          <Link href="/ponto/novo">
            <Plus className="size-4" />
            Novo registro
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          Você ainda não registrou nenhum ponto.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((e) => (
            <div
              key={e.id}
              className="bg-card border-border rounded-lg border p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{formatDate(e.workDate)}</span>
                <Badge variant="secondary">
                  {formatWorkedMinutes(e.workedMinutes)}
                </Badge>
              </div>
              <div className="text-foreground/90 mt-2">
                <Markdown source={e.description} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
