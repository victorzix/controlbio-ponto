import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";

/**
 * Guarda otimista de rotas (Next 16 "proxy", antigo "middleware"). Roda no edge
 * e só inspeciona a PRESENÇA do cookie de sessão — a validação autoritativa (no
 * banco) acontece no `(app)/layout.tsx` via `getCurrentUser()`. Ver design §1/§4.
 */
const PUBLIC_PATHS = ["/login"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Anônimo tentando rota interna → manda pro login guardando o destino (RF-08).
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(url);
  }

  // Já logado abrindo o login → manda pra área interna (RF-07).
  if (hasSession && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Ignora API, assets do Next e arquivos com extensão (imagens, etc.).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
