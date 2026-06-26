/**
 * Nome do cookie de sessão.
 *
 * Vive em um módulo isolado (sem importar o banco) porque a `middleware.ts`
 * roda no edge runtime e não pode arrastar o cliente Postgres no bundle.
 */
export const SESSION_COOKIE_NAME = "session";

/**
 * Define se o cookie de sessão usa a flag `Secure` (só trafega em HTTPS).
 *
 * Padrão: ligado em produção. Em produção **sem TLS** (ex.: VPS servindo HTTP
 * direto), o browser não envia um cookie `Secure` por HTTP e o login "não cola";
 * nesse caso defina `SESSION_COOKIE_SECURE=false`. ⚠️ Sem HTTPS, senha e sessão
 * trafegam em texto puro — prefira um proxy TLS na frente.
 */
export function isSessionCookieSecure(): boolean {
  const flag = process.env.SESSION_COOKIE_SECURE;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return process.env.NODE_ENV === "production";
}
