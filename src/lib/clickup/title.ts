/**
 * Normaliza o título para comparação entre o ponto e a tarefa do ClickUp.
 *
 * É a chave de identidade da atividade (spec 011, RN-01): dois pontos com o
 * mesmo título normalizado, no mesmo projeto, alimentam a MESMA tarefa.
 * Por isso a normalização precisa ser estável e previsível — qualquer mudança
 * aqui reaponta o índice `clickup_task_links` existente.
 */
/** Faixa Unicode das marcas de acentuação que o NFD separa (combining marks). */
const COMBINING_MIN = 0x0300;
const COMBINING_MAX = 0x036f;

export function normalizeTitle(raw: string): string {
  // NFD separa "ç" em "c" + cedilha; aqui descartamos a marca e fica só a letra.
  // Filtrar por faixa de code point (em vez de regex com escape Unicode) mantém
  // o código legível e sem caracteres invisíveis no fonte.
  const semAcento = Array.from(raw.normalize("NFD"))
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp < COMBINING_MIN || cp > COMBINING_MAX;
    })
    .join("");

  return semAcento.toLowerCase().replace(/\s+/g, " ").trim();
}
