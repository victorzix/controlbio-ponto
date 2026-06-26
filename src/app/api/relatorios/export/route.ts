import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listEntriesForExport } from "@/lib/relatorios/data";
import { buildReportWorkbook } from "@/lib/relatorios/export";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Download do relatório de horas em `.xlsx` (spec 006). Guarda no servidor:
 * exige `ponto:ver_equipe` (RN-04). Params: `from`, `to` (YYYY-MM-DD) e `users`
 * (ids separados por vírgula). O arquivo é gerado na hora, sem dependências.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!can(user.role, "ponto:ver_equipe")) {
    return new Response("Acesso negado.", { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return new Response("Período inválido.", { status: 400 });
  }
  const range = from <= to ? { from, to } : { from: to, to: from };

  const userIds = (params.get("users") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const entries = await listEntriesForExport(range, userIds);
  const buffer = buildReportWorkbook(entries);

  const filename = `relatorio-horas_${range.from}_a_${range.to}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}