import { describe, it, expect } from "vitest";
import { startTrackingSchema, finalizeTrackingSchema } from "./validation";

describe("startTrackingSchema", () => {
  it("aceita título + projeto", () => {
    const r = startTrackingSchema.safeParse({ title: "Tarefa", project: "dw" });
    expect(r.success).toBe(true);
  });

  it("recusa título vazio", () => {
    const r = startTrackingSchema.safeParse({ title: "  ", project: "dw" });
    expect(r.success).toBe(false);
  });

  it("recusa projeto inválido", () => {
    const r = startTrackingSchema.safeParse({ title: "x", project: "outro" });
    expect(r.success).toBe(false);
  });
});

describe("finalizeTrackingSchema", () => {
  const seg = {
    id: "s1",
    workDate: "2026-01-10",
    hours: 1,
    minutes: 30,
    description: "feito",
  };

  it("aceita título/projeto + ao menos um bloco válido", () => {
    const r = finalizeTrackingSchema.safeParse({
      title: "T",
      project: "labphase",
      segments: [seg],
    });
    expect(r.success).toBe(true);
  });

  it("recusa lista de blocos vazia", () => {
    const r = finalizeTrackingSchema.safeParse({
      title: "T",
      project: "labphase",
      segments: [],
    });
    expect(r.success).toBe(false);
  });

  it("recusa tempo zero no bloco", () => {
    const r = finalizeTrackingSchema.safeParse({
      title: "T",
      project: "labphase",
      segments: [{ ...seg, hours: 0, minutes: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("recusa tempo acima de 24h no bloco", () => {
    const r = finalizeTrackingSchema.safeParse({
      title: "T",
      project: "labphase",
      segments: [{ ...seg, hours: 24, minutes: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("recusa dia no futuro (RN-10/14)", () => {
    const r = finalizeTrackingSchema.safeParse({
      title: "T",
      project: "labphase",
      segments: [{ ...seg, workDate: "2999-01-01" }],
    });
    expect(r.success).toBe(false);
  });
});
