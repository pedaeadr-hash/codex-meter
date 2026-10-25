import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUsage } from "../usage.mjs";

test("normaliza janelas do Codex e atividade semanal", () => {
  const now = new Date("2026-10-24T15:00:00-03:00");
  const result = normalizeUsage({
    rateLimitsByLimitId: {
      codex: {
        planType: "plus",
        primary: { usedPercent: 85, windowDurationMins: 300, resetsAt: 1792880816 },
        secondary: { usedPercent: 28, windowDurationMins: 10080, resetsAt: 1793395990 },
      },
    },
  }, {
    summary: { peakDailyTokens: 1000 },
    dailyUsageBuckets: [
      { startDate: "2026-10-23", tokens: 300 },
      { startDate: "2026-10-24", tokens: 200 },
    ],
  }, now);

  assert.equal(result.primary.label, "5 horas");
  assert.equal(result.primary.usedPercent, 85);
  assert.equal(result.primary.remainingPercent, 15);
  assert.equal(result.secondary.label, "Semanal");
  assert.equal(result.secondary.usedPercent, 28);
  assert.equal(result.today.tokens, 200);
  assert.equal(result.today.shareOfWeekPercent, 40);
  assert.equal(result.week.tokens, 500);
  assert.equal(result.week.daily.length, 7);
});

test("limita percentuais fora do intervalo", () => {
  const result = normalizeUsage({
    rateLimits: {
      primary: { usedPercent: 160, windowDurationMins: 300 },
      secondary: { usedPercent: -12, windowDurationMins: 10080 },
    },
  }, {}, new Date("2026-10-24T12:00:00Z"));

  assert.equal(result.primary.usedPercent, 100);
  assert.equal(result.secondary.usedPercent, 0);
});
