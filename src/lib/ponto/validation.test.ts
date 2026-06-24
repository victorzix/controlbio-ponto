import { describe, it, expect } from "vitest";
import {
  createEntrySchema,
  formatWorkedMinutes,
  todayISODate,
} from "./validation";

const ok = {
  workDate: todayISODate(),
  hours: "8",
  minutes: "30",
  description: "fiz coisas",
};

describe("createEntrySchema", () => {
  it("aceita registro válido e converte os números", () => {
    const r = createEntrySchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hours).toBe(8);
      expect(r.data.minutes).toBe(30);
    }
  });

  it("recusa tempo total zero", () => {
    expect(
      createEntrySchema.safeParse({ ...ok, hours: "0", minutes: "0" }).success,
    ).toBe(false);
  });

  it("recusa minutos >= 60", () => {
    expect(createEntrySchema.safeParse({ ...ok, minutes: "60" }).success).toBe(false);
  });

  it("recusa horas > 24", () => {
    expect(createEntrySchema.safeParse({ ...ok, hours: "25" }).success).toBe(false);
  });

  it("recusa dia no futuro", () => {
    expect(
      createEntrySchema.safeParse({ ...ok, workDate: "2999-01-01" }).success,
    ).toBe(false);
  });

  it("recusa descrição vazia", () => {
    expect(
      createEntrySchema.safeParse({ ...ok, description: "   " }).success,
    ).toBe(false);
  });
});

describe("formatWorkedMinutes", () => {
  it("formata horas e minutos", () => {
    expect(formatWorkedMinutes(510)).toBe("8h 30min");
    expect(formatWorkedMinutes(60)).toBe("1h");
    expect(formatWorkedMinutes(45)).toBe("45min");
  });
});
