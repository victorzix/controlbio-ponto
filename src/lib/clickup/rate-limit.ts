/**
 * Token bucket para respeitar o limite do ClickUp — spec 011, RNF de limite externo.
 *
 * O plano do workspace dá ~100 req/min e o pipeline gasta várias por ponto.
 * Quando alguém lança um mês atrasado de uma vez (CA-19), a fila tem que ficar
 * LENTA, não quebrar. Por isso aqui a gente espera em vez de deixar dar 429.
 *
 * `now` e `sleep` são injetáveis para o teste não depender de tempo real.
 */

export type RateLimiter = {
  take(): Promise<void>;
  observe(headers: { remaining: number | null; resetAt: Date | null }): void;
};

export function createRateLimiter(opts: {
  perMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const capacity = Math.max(1, opts.perMinute);
  const refillPerMs = capacity / 60_000;

  let tokens = capacity;
  let lastRefill = now();
  /** Quando o ClickUp diz que zerou, seguramos até este instante. */
  let blockedUntil = 0;

  function refill() {
    const t = now();
    const elapsed = t - lastRefill;
    if (elapsed > 0) {
      tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
      lastRefill = t;
    }
  }

  return {
    async take() {
      const blockWait = blockedUntil - now();
      if (blockWait > 0) {
        await sleep(blockWait);
        blockedUntil = 0;
      }

      refill();
      if (tokens < 1) {
        // Tempo até um token voltar a existir.
        await sleep(Math.ceil((1 - tokens) / refillPerMs));
        refill();
      }
      tokens -= 1;
    },

    observe({ remaining, resetAt }) {
      // resetAt no passado é leitura velha: a janela do ClickUp já virou,
      // então essa contagem não vale mais nada — ignoramos por completo para
      // uma resposta atrasada nunca travar a fila (senão "tokens" ficaria
      // preso em zero para sempre, mesmo com o balde do ClickUp já cheio).
      const stale = resetAt !== null && resetAt.getTime() <= now();
      if (stale) return;

      if (remaining !== null) {
        // O servidor é a autoridade: nunca acreditamos em mais do que ele diz.
        tokens = Math.min(tokens, remaining);
      }
      if (remaining !== null && remaining <= 0 && resetAt) {
        blockedUntil = Math.max(blockedUntil, resetAt.getTime());
      }
    },
  };
}
