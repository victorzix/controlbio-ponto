/**
 * Nome do cookie de sessão.
 *
 * Vive em um módulo isolado (sem importar o banco) porque a `middleware.ts`
 * roda no edge runtime e não pode arrastar o cliente Postgres no bundle.
 */
export const SESSION_COOKIE_NAME = "session";
