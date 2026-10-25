const $ = (selector) => document.querySelector(selector);

const elements = {
  refreshButton: $("#refreshButton"),
  statusText: $("#statusText"),
  liveDot: $("#liveDot"),
  planBadge: $("#planBadge"),
  primaryRing: $("#primaryRing"),
  primaryValue: $("#primaryValue"),
  primaryLabel: $("#primaryLabel"),
  primaryReset: $("#primaryReset"),
  weeklyRing: $("#weeklyRing"),
  weeklyValue: $("#weeklyValue"),
  weeklyLabel: $("#weeklyLabel"),
  weeklyReset: $("#weeklyReset"),
  todayTokens: $("#todayTokens"),
  todayShare: $("#todayShare"),
  weekTotal: $("#weekTotal"),
  weekChart: $("#weekChart"),
  updatedAt: $("#updatedAt"),
  keySheet: $("#keySheet"),
  keyForm: $("#keyForm"),
  keyInput: $("#keyInput"),
};

const numberFormatter = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "narrow", timeZone: "UTC" });

function storedKey() {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("key");
  if (fromUrl) {
    localStorage.setItem("codex-meter-key", fromUrl);
    url.searchParams.delete("key");
    history.replaceState({}, "", url.pathname + url.search + url.hash);
    return fromUrl;
  }
  return localStorage.getItem("codex-meter-key") || "";
}

let key = storedKey();

function resetText(value) {
  if (!value) return "Reset não informado";
  const date = new Date(value);
  const difference = date.getTime() - Date.now();
  const hours = Math.max(0, Math.ceil(difference / 3_600_000));
  if (hours < 24) return `renova em ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `renova em ${days}d`;
}

function setRing(element, value) {
  const safeValue = Math.min(100, Math.max(0, Number(value) || 0));
  const circle = element.querySelector(".ring-value");
  const circumference = 276.46;
  requestAnimationFrame(() => {
    circle.style.strokeDashoffset = String(circumference * (1 - safeValue / 100));
  });
  element.classList.toggle("near-limit", safeValue >= 90);
}

function renderLimit(prefix, limit) {
  const ring = prefix === "primary" ? elements.primaryRing : elements.weeklyRing;
  const value = prefix === "primary" ? elements.primaryValue : elements.weeklyValue;
  const label = prefix === "primary" ? elements.primaryLabel : elements.weeklyLabel;
  const reset = prefix === "primary" ? elements.primaryReset : elements.weeklyReset;
  if (!limit) {
    value.textContent = "—";
    reset.textContent = "Sem dados";
    return;
  }
  setRing(ring, limit.usedPercent);
  value.textContent = `${Math.round(limit.usedPercent)}%`;
  label.textContent = limit.label;
  reset.textContent = `${Math.round(limit.remainingPercent)}% livre · ${resetText(limit.resetsAt)}`;
}

function renderChart(days) {
  const max = Math.max(1, ...days.map((day) => day.tokens));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  elements.weekChart.replaceChildren(...days.map((day) => {
    const column = document.createElement("div");
    column.className = `day-column${day.date === today ? " today" : ""}`;
    column.title = `${day.date}: ${numberFormatter.format(day.tokens)} tokens`;

    const track = document.createElement("div");
    track.className = "day-track";
    const fill = document.createElement("div");
    fill.className = "day-fill";
    fill.style.height = `${Math.max(day.tokens ? 8 : 3, (day.tokens / max) * 100)}%`;
    track.append(fill);

    const label = document.createElement("span");
    label.className = "day-label";
    label.textContent = weekdayFormatter.format(new Date(`${day.date}T12:00:00Z`));
    column.append(track, label);
    return column;
  }));
}

function render(data) {
  renderLimit("primary", data.primary);
  renderLimit("secondary", data.secondary);
  elements.todayTokens.textContent = numberFormatter.format(data.today.tokens);
  elements.todayShare.textContent = data.today.versusPeakPercent == null
    ? "—"
    : `${Math.round(data.today.versusPeakPercent)}%`;
  elements.weekTotal.textContent = `${numberFormatter.format(data.week.tokens)} tokens`;
  elements.planBadge.textContent = data.planType || "Codex";
  renderChart(data.week.daily);
  elements.updatedAt.textContent = `Atualizado às ${dateFormatter.format(new Date(data.updatedAt))}`;
}

function setStatus(message, online = false) {
  elements.statusText.textContent = message;
  elements.liveDot.classList.toggle("online", online);
}

async function refresh() {
  if (!key) {
    elements.keySheet.hidden = false;
    elements.keyInput.focus();
    return;
  }

  elements.refreshButton.setAttribute("aria-busy", "true");
  setStatus("Atualizando…");
  try {
    const response = await fetch("/api/usage", {
      headers: { "x-access-key": key },
      cache: "no-store",
    });
    const payload = await response.json();
    if (response.status === 401) {
      localStorage.removeItem("codex-meter-key");
      key = "";
      elements.keySheet.hidden = false;
      throw new Error("Chave inválida");
    }
    if (!response.ok) throw new Error(payload.detail || payload.error || "Falha ao atualizar");
    render(payload);
    setStatus("Dados ao vivo", true);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Sem conexão");
  } finally {
    elements.refreshButton.removeAttribute("aria-busy");
  }
}

elements.refreshButton.addEventListener("click", refresh);
elements.keyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  key = elements.keyInput.value.trim();
  if (!key) return;
  localStorage.setItem("codex-meter-key", key);
  elements.keySheet.hidden = true;
  refresh();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

refresh();
setInterval(refresh, 60_000);
