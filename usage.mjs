const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function lastDateKeys(count, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - (count - 1 - index));
    return localDateKey(date);
  });
}

function describeWindow(window) {
  if (!window) return null;
  const duration = Number(window.windowDurationMins || 0);
  const labels = {
    300: "5 horas",
    1440: "Diário",
    10080: "Semanal",
  };

  return {
    label: labels[duration] || `${Math.round(duration / 60)} horas`,
    usedPercent: clamp(window.usedPercent),
    remainingPercent: clamp(100 - clamp(window.usedPercent)),
    windowDurationMins: duration,
    resetsAt: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null,
  };
}

export function normalizeUsage(rateLimitPayload = {}, usagePayload = {}, now = new Date()) {
  const limits = rateLimitPayload.rateLimitsByLimitId?.codex
    || rateLimitPayload.rateLimits
    || {};
  const summary = usagePayload.summary || {};
  const buckets = Array.isArray(usagePayload.dailyUsageBuckets)
    ? usagePayload.dailyUsageBuckets
    : [];
  const byDate = new Map(buckets.map((bucket) => [bucket.startDate, Number(bucket.tokens) || 0]));
  const dates = lastDateKeys(7, now);
  const daily = dates.map((date) => ({ date, tokens: byDate.get(date) || 0 }));
  const todayTokens = byDate.get(localDateKey(now)) || 0;
  const weekTokens = daily.reduce((sum, day) => sum + day.tokens, 0);
  const peakDailyTokens = Number(summary.peakDailyTokens) || 0;

  return {
    updatedAt: now.toISOString(),
    planType: limits.planType || null,
    primary: describeWindow(limits.primary),
    secondary: describeWindow(limits.secondary),
    today: {
      tokens: todayTokens,
      versusPeakPercent: peakDailyTokens > 0 ? clamp((todayTokens / peakDailyTokens) * 100) : null,
      shareOfWeekPercent: weekTokens > 0 ? clamp((todayTokens / weekTokens) * 100) : null,
    },
    week: {
      tokens: weekTokens,
      daily,
    },
    summary: {
      lifetimeTokens: summary.lifetimeTokens ?? null,
      peakDailyTokens: summary.peakDailyTokens ?? null,
      currentStreakDays: summary.currentStreakDays ?? null,
    },
  };
}
