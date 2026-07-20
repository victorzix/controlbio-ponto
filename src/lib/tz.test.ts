import { describe, it, expect } from "vitest";
import { brasiliaDateISO } from "./tz";

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
