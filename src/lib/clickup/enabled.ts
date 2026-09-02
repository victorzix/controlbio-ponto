/**
 * Chave geral da integração ClickUp (spec 011). Puramente leitura de
 * `process.env` — **não importa `@/db`** (nem transitivamente): `src/db/index.ts`
 * lança se `DATABASE_URL` não estiver definida, e este módulo precisa funcionar
 * (e ser testável) sem nenhuma credencial configurada.
 *
 * Sem `CLICKUP_API_TOKEN` — ou com `CLICKUP_SYNC_ENABLED=false` — a integração
 * fica inerte: nada é enfileirado e os registros nascem `off`. É o que mantém
 * o ambiente de desenvolvimento e a suíte de testes funcionando sem credencial,
 * e também o botão de desligar em produção.
 */
export function isSyncEnabled(): boolean {
  if (process.env.CLICKUP_SYNC_ENABLED === "false") return false;
  return Boolean(process.env.CLICKUP_API_TOKEN);
}

/** Status inicial de `clickupSyncStatus` para um registro recém-criado. */
export function initialSyncStatus(): "pending" | "off" {
  return isSyncEnabled() ? "pending" : "off";
}
