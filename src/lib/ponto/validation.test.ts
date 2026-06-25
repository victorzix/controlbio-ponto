import { describe, it, expect } from "vitest";
import {
  createEntrySchema,
  updateEntrySchema,
  formatWorkedMinutes,
  todayISODate,
} from "./validation";

const ok = {
  title: "Reunião de alinhamento",
  workDate: todayISODate(),
  hours: 8,
  minutes: 30,
  description: "fiz coisas",
};

describe("createEntrySchema", () => {
  it("aceita registro válido", () => {
    const r = createEntrySchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.hours).toBe(8);
      expect(r.data.minutes).toBe(30);
    }
  });

  it("recusa tempo total zero", () => {
    expect(
      createEntrySchema.safeParse({ ...ok, hours: 0, minutes: 0 }).success,
    ).toBe(false);
  });

  it("recusa minutos >= 60", () => {
    expect(createEntrySchema.safeParse({ ...ok, minutes: 60 }).success).toBe(false);
  });

  it("aceita > 24h na criação (será dividido em vários dias)", () => {
    expect(createEntrySchema.safeParse({ ...ok, hours: 80 }).success).toBe(true);
  });

  it("recusa acima do teto de divisão (744h)", () => {
    expect(createEntrySchema.safeParse({ ...ok, hours: 745 }).success).toBe(
      false,
    );
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

  it("recusa título vazio", () => {
    expect(createEntrySchema.safeParse({ ...ok, title: "   " }).success).toBe(
      false,
    );
  });

  it("aceita sem link e com link vazio (opcional)", () => {
    expect(createEntrySchema.safeParse(ok).success).toBe(true);
    expect(createEntrySchema.safeParse({ ...ok, link: "" }).success).toBe(true);
  });

  it("aceita link http(s) válido", () => {
    const r = createEntrySchema.safeParse({
      ...ok,
      link: "https://app.clickup.com/t/abc123",
    });
    expect(r.success).toBe(true);
  });

  it("recusa link inválido / com esquema não-http", () => {
    expect(createEntrySchema.safeParse({ ...ok, link: "não é url" }).success).toBe(
      false,
    );
    expect(
      createEntrySchema.safeParse({ ...ok, link: "javascript:alert(1)" }).success,
    ).toBe(false);
  });
});

describe("updateEntrySchema", () => {
  it("aceita registro válido de até 24h", () => {
    expect(updateEntrySchema.safeParse({ ...ok, hours: 24, minutes: 0 }).success).toBe(
      true,
    );
  });

  it("recusa > 24h na edição (sem divisão)", () => {
    expect(updateEntrySchema.safeParse({ ...ok, hours: 25 }).success).toBe(false);
    expect(updateEntrySchema.safeParse({ ...ok, hours: 80 }).success).toBe(false);
  });
});

describe("formatWorkedMinutes", () => {
  it("formata horas e minutos", () => {
    expect(formatWorkedMinutes(510)).toBe("8h 30min");
    expect(formatWorkedMinutes(60)).toBe("1h");
    expect(formatWorkedMinutes(45)).toBe("45min");
  });
});
