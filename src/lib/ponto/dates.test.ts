import { describe, it, expect } from "vitest";
import { formatEntryDateLabel } from "./dates";

// 2026-06-25 é quinta-feira; a segunda desta semana é 2026-06-22.
const today = "2026-06-25";

describe("formatEntryDateLabel", () => {
  it("hoje", () => {
    expect(formatEntryDateLabel("2026-06-25", today)).toBe("Hoje");
  });

  it("ontem", () => {
    expect(formatEntryDateLabel("2026-06-24", today)).toBe("Ontem");
  });

  it("dia da semana quando é da semana atual", () => {
    expect(formatEntryDateLabel("2026-06-23", today)).toBe("Terça-feira");
    expect(formatEntryDateLabel("2026-06-22", today)).toBe("Segunda-feira");
  });

  it("data por extenso quando é de semana anterior", () => {
    expect(formatEntryDateLabel("2026-06-21", today)).toBe(
      "21 de junho de 2026",
    );
  });
});
