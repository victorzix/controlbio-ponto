/**
 * Taxonomia de erro da integração — spec 011, design §5.2.
 *
 * A distinção que importa é RECUPERÁVEL vs TERMINAL: recuperável volta para a
 * fila com backoff; terminal marca o job como `failed` e pede ação humana.
 * Insistir num erro terminal só queima o limite de requisições.
 */

export type ErrorCode =
  | "RATE_LIMIT"
  | "INDISPONIVEL"
  | "TOKEN_INVALIDO"
  | "TAREFA_SUMIU"
  | "REQUISICAO_INVALIDA"
  | "CONFIG_AUSENTE"
  | "SEM_VINCULO"
  | "DESCONHECIDO";

export class ClickUpError extends Error {
  readonly code: ErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly resetAt: Date | null;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status?: number | null;
    retryable: boolean;
    resetAt?: Date | null;
  }) {
    super(init.message);
    this.name = "ClickUpError";
    this.code = init.code;
    this.status = init.status ?? null;
    this.retryable = init.retryable;
    this.resetAt = init.resetAt ?? null;
  }
}

/**
 * @param path Caminho da requisição que falhou (ex.: `/v2/folder/123/list`).
 *   Só entra na mensagem do 404, onde é a diferença entre "alguma coisa não
 *   existe" e saber **o quê** — ver o comentário abaixo.
 */
export function classifyHttp(
  status: number,
  body: string,
  resetAt: Date | null,
  path?: string,
): ClickUpError {
  if (status === 429) {
    return new ClickUpError({
      code: "RATE_LIMIT",
      message: "Limite de requisições do ClickUp atingido.",
      status,
      retryable: true,
      resetAt,
    });
  }
  if (status >= 500) {
    return new ClickUpError({
      code: "INDISPONIVEL",
      message: `ClickUp indisponível (HTTP ${status}). ${body}`.trim(),
      status,
      retryable: true,
    });
  }
  if (status === 401 || status === 403) {
    return new ClickUpError({
      code: "TOKEN_INVALIDO",
      message: "Token do ClickUp inválido ou sem permissão.",
      status,
      retryable: false,
    });
  }
  if (status === 404) {
    // Tarefa apagada no ClickUp: o índice local está velho. Limpar e recriar.
    //
    // O CAMINHO entra na mensagem porque nem todo 404 é tarefa sumida: um
    // `folderId` digitado errado na configuração (bem provável no primeiro dia)
    // dá 404 em `/v2/folder/{id}/list` e, sem o caminho, chega ao admin como
    // "recurso não encontrado" — depois de cinco tentativas ao longo de ~7h,
    // apontando para o lugar errado.
    return new ClickUpError({
      code: "TAREFA_SUMIU",
      message: path
        ? `Recurso não encontrado no ClickUp (${path}).`
        : "Recurso não encontrado no ClickUp.",
      status,
      retryable: true,
    });
  }
  if (status === 400 || status === 422) {
    return new ClickUpError({
      code: "REQUISICAO_INVALIDA",
      message: `Requisição rejeitada pelo ClickUp: ${body}`,
      status,
      retryable: false,
    });
  }
  return new ClickUpError({
    code: "DESCONHECIDO",
    message: `Erro inesperado do ClickUp (HTTP ${status}). ${body}`.trim(),
    status,
    retryable: false,
  });
}

/** 1min → 5min → 15min → 1h → 6h. */
export const BACKOFF_STEPS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

export function computeBackoffMs(attempt: number): number {
  const i = Math.min(Math.max(attempt, 0), BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[i];
}
