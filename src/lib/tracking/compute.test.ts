import { describe, it, expect } from "vitest";
import { computeElapsedAndStatus } from "./compute";
import { formatClock, msToHoursMinutes, parseTimeToHM } from "./format";

describe("computeElapsedAndStatus", () => {
  const now = new Date("2026-07-20T12:00:00Z");

  it("soma segmentos fechados e marca pausado", () => {
    const r = computeElapsedAndStatus(
      [
        {
          startedAt: new Date("2026-07-20T10:00:00Z"),
          endedAt: new Date("2026-07-20T10:40:00Z"), // 40 min
        },
        {
          startedAt: new Date("2026-07-20T11:00:00Z"),
          endedAt: new Date("2026-07-20T11:25:00Z"), // 25 min
        },
      ],
      now,
    );
    expect(r.status).toBe("paused");
    expect(r.elapsedMs).toBe(65 * 60_000);
  });

  it("segmento aberto conta até agora e marca rodando", () => {
    const r = computeElapsedAndStatus(
      [{ startedAt: new Date("2026-07-20T11:30:00Z"), endedAt: null }],
      now,
    );
    expect(r.status).toBe("running");
    expect(r.elapsedMs).toBe(30 * 60_000);
  });

  it("sem segmentos = 0 e pausado", () => {
    const r = computeElapsedAndStatus([], now);
    expect(r).toEqual({ elapsedMs: 0, status: "paused" });
  });
});

describe("formatClock", () => {
  it("formata HH:MM:SS", () => {
    expect(formatClock(0)).toBe("00:00:00");
    expect(formatClock(65 * 60_000 + 5000)).toBe("01:05:05");
    expect(formatClock(25 * 3600_000)).toBe("25:00:00"); // sem teto de horas
  });
});

describe("msToHoursMinutes", () => {
  it("arredonda ao minuto e nunca zera (RN-11)", () => {
    expect(msToHoursMinutes(20_000)).toEqual({ hours: 0, minutes: 1 }); // 20s → 1min
    expect(msToHoursMinutes(90 * 60_000)).toEqual({ hours: 1, minutes: 30 });
    expect(msToHoursMinutes(29_000)).toEqual({ hours: 0, minutes: 1 }); // 29s → 0? não: →1 (mín)
  });
});

describe("parseTimeToHM", () => {
  it("aceita HH:MM", () => {
    expect(parseTimeToHM("23:40")).toEqual({ h: 23, m: 40 });
    expect(parseTimeToHM("09:05")).toEqual({ h: 9, m: 5 });
  });

  it("aceita dígitos colados (HHMM / HMM / HH)", () => {
    expect(parseTimeToHM("2340")).toEqual({ h: 23, m: 40 });
    expect(parseTimeToHM("940")).toEqual({ h: 9, m: 40 });
    expect(parseTimeToHM("23")).toEqual({ h: 23, m: 0 });
  });

  it("recusa horário inválido", () => {
    expect(parseTimeToHM("2461")).toBeNull(); // 24h / 61min
    expect(parseTimeToHM("25:00")).toBeNull();
    expect(parseTimeToHM("12:99")).toBeNull();
    expect(parseTimeToHM("")).toBeNull();
    expect(parseTimeToHM("abc")).toBeNull();
  });
});
