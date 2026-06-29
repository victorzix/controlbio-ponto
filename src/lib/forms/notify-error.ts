import { toast } from "sonner";

/**
 * Mensagem genérica para erro **inesperado** de submit (Server Action que
 * lançou/rejeitou: erro de servidor, queda do banco, bug). Erro de validação e
 * erro de negócio retornado (`{ error }`/`{ fieldErrors }`) continuam inline no
 * formulário — ver `docs/specs/008-feedback-de-erros` (RN-02/RN-03).
 */
export const UNEXPECTED_ERROR_MESSAGE =
  "Algo deu errado. Tente novamente em instantes.";

/**
 * Reporta um erro inesperado de ação ao usuário via toast e registra no console
 * para depuração. Use no `catch` dos handlers de submit dos formulários, de
 * modo que uma Server Action que **lança** nunca falhe em silêncio.
 */
export function notifyUnexpectedError(error: unknown): void {
  console.error(error);
  toast.error(UNEXPECTED_ERROR_MESSAGE);
}
