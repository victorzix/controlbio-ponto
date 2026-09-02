import { describe, it, expect } from "vitest";
import { brasiliaDateISO, brasiliaInstant } from "./tz";

describe("brasiliaDateISO", () => {
  it("usa o fuso de Brasília (UTC-3), não UTC", () => {
    // 02:30 UTC = 23:30 do dia anterior em Brasília → conta no dia anterior.
    expect(brasiliaDateISO(new Date("2026-07-20T02:30:00Z"))).toBe("2026-07-19");
  });

  it("mesma data quando o instante já é de dia em Brasília", () => {
    // 12:00 UTC = 09:00 em Brasília.
    expect(brasiliaDateISO(new Date("2026-07-20T12:00:00Z"))).toBe("2026-07-20");
  });

  it("segmento que cruza a meia-noite conta no dia do início (RN-14)", () => {
    // Início 23:50 (Brasília) = 02:50Z do dia seguinte.
    expect(brasiliaDateISO(new Date("2026-07-21T02:50:00Z"))).toBe("2026-07-20");
  });
});

describe("brasiliaInstant", () => {
  it("converte dia civil + hora de Brasília no instante UTC correspondente", () => {
    // 09:00 em Brasília (UTC-3) é 12:00Z do mesmo dia.
    expect(brasiliaInstant("2026-06-25", 9).toISOString()).toBe(
      "2026-06-25T12:00:00.000Z",
    );
  });

  it("aceita minutos e preserva o dia civil de Brasília", () => {
    const d = brasiliaInstant("2026-01-01", 9, 30);
    expect(d.toISOString()).toBe("2026-01-01T12:30:00.000Z");
    expect(brasiliaDateISO(d)).toBe("2026-01-01");
  });

  it("meia-noite de Brasília continua no dia civil pedido", () => {
    // 00:00 em Brasília = 03:00Z: o dia em UTC coincide, mas o que precisa
    // bater é a data civil de lá — é ela que o ponto registra.
    const d = brasiliaInstant("2026-12-31", 0);
    expect(d.toISOString()).toBe("2026-12-31T03:00:00.000Z");
    expect(brasiliaDateISO(d)).toBe("2026-12-31");
  });
});
