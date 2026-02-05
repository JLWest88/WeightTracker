const STORAGE_KEY = "wt_entries_v1";
const GOAL_KEY = "wt_goal_delta7_v1";
const ASOF_KEY = "wt_asof_date_v1";
const APP_VERSION = "2026-02-04.2";

const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) appVersionEl.textContent = APP_VERSION;

const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const notesInput = document.getElementById("notesInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const cancelBtn = document.getElementById("cancelBtn");

const latestDateEl = document.getElementById("latestDate");
const latestWeightEl = document.getElementById("latestWeight");

const ma7El = document.getElementById("ma7");
const ma14El = document.getElementById("ma14");
const ma28El = document.getElementById("ma28");

const ma7PrevEl = document.getElementById("ma7Prev");
const ma7DeltaEl = document.getElementById("ma7Delta");
const ma14PrevEl = document.getElementById("ma14Prev");
const ma14DeltaEl = document.getElementById("ma14Delta");
const ma28PrevEl = document.getElementById("ma28Prev");
const ma28DeltaEl = document.getElementById("ma28Delta");

const asOfDisplayEl = document.getElementById("asOfDateDisplay");
const asOfPrevBtn = document.getElementById("asOfPrev");
const asOfNextBtn = document.getElementById("asOfNext");
const asOfSelect = document.getElementById("asOfSelect");

const goalInput = document.getElementById("goalDelta7");
const reqNext7AvgEl = document.getElementById("reqNext7Avg");
const reqNext7HintEl = document.getElementById("reqNext7Hint");

const entriesList = document.getElementById("entriesList");
const entryStats = document.getElementById("entryStats");

let editingId = null;
let asOfDateISO = null;
let goalDelta7 = 0.0;

/* ---------------- Utilities ---------------- */

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function formatISO(iso) {
  return isoToDate(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function escapeHtml(s) {
  return String(s || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/* ---------------- Storage ---------------- */

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadGoal() {
  const v = Number(localStorage.getItem(GOAL_KEY));
  return Number.isFinite(v) ? v : 0.0;
}

function saveGoal(v) {
  localStorage.setItem(GOAL_KEY, String(v));
}

function loadAsOf() {
  return localStorage.getItem(ASOF_KEY);
}

function saveAsOf(v) {
  if (!v) localStorage.removeItem(ASOF_KEY);
  else localStorage.setItem(ASOF_KEY, v);
}

/* ---------------- Entry Helpers ---------------- */

function ensureIds(entries) {
  let changed = false;
  for (const e of entries) {
    if (!e.id) {
      e.id = crypto.randomUUID();
      e.createdAt = Date.now();
      changed = true;
    }
  }
  if (changed) saveEntries(entries);
  return entries;
}

function getEntryDatesAsc(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return [...new Set(sorted.map(e => e.date))];
}

function clampAsOf(asOf, dates) {
  if (!dates.length) return null;
  if (!asOf) return dates[dates.length - 1];
  if (dates.includes(asOf)) return asOf;
  const earlier = dates.filter(d => d <= asOf);
  return earlier.length ? earlier[earlier.length - 1] : dates[0];
}

function stepAsOf(asOf, dates, dir) {
  const i = dates.indexOf(asOf);
  if (i === -1) return asOf;
  const next = Math.min(dates.length - 1, Math.max(0, i + dir));
  return dates[next];
}

/* ---------------- Metrics ---------------- */

function computeMetrics(entries, asOfISO) {
  if (!entries.length) return null;

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const dates = getEntryDatesAsc(sorted);
  const asOf = clampAsOf(asOfISO, dates);
  const asOfDate = isoToDate(asOf);

  function windowStats(endDate, days) {
    const start = addDays(endDate, -(days - 1));
    const vals = sorted
      .filter(e => {
        const d = isoToDate(e.date);
        return d >= start && d <= endDate;
      })
      .map(e => e.weight);

    if (!vals.length) return { avg: null, count: 0 };
    return {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      count: vals.length
    };
  }

  function currentAndPrior(days) {
    const cur = windowStats(asOfDate, days);
    const prior = windowStats(addDays(asOfDate, -days), days);
    const delta =
      cur.avg != null && prior.avg != null ? cur.avg - prior.avg : null;
    return { cur, prior, delta };
  }

  const w7 = currentAndPrior(7);
  const w14 = currentAndPrior(14);
  const w28 = currentAndPrior(28);

  return {
    asOf,
    latestDate: dates[dates.length - 1],
    latestWeight: sorted[sorted.length - 1].weight,
    w7,
    w14,
    w28
  };
}

/* ---------------- Render ---------------- */

function render() {
  const entries = ensureIds(loadEntries());
  const m = computeMetrics(entries, asOfDateISO);

  if (!m) {
    latestDateEl.textContent = "—";
    latestWeightEl.textContent = "—";
    ma7El.textContent = ma14El.textContent = ma28El.textContent = "—";
    return;
  }

  asOfDateISO = m.asOf;
  saveAsOf(asOfDateISO);

  latestDateEl.textContent = formatISO(m.latestDate);
  latestWeightEl.textContent = round1(m.latestWeight).toFixed(1);
  asOfDisplayEl.textContent = formatISO(asOfDateISO);

  const dates = getEntryDatesAsc(entries);
  asOfSelect.innerHTML = dates
    .map(d => `<option value="${d}">${formatISO(d)}</option>`)
    .join("");
  asOfSelect.value = asOfDateISO;

  function setMetric(el, val) {
    el.textContent = val == null ? "—" : round1(val).toFixed(1);
  }

  setMetric(ma7El, m.w7.cur.avg);
  setMetric(ma14El, m.w14.cur.avg);
  setMetric(ma28El, m.w28.cur.avg);

  ma7PrevEl.textContent = m.w7.prior.avg == null ? "—" : round1(m.w7.prior.avg).toFixed(1);
  ma7DeltaEl.textContent = m.w7.delta == null ? "—" : (m.w7.delta > 0 ? "+" : "") + round1(m.w7.delta).toFixed(1);

  ma14PrevEl.textContent = m.w14.prior.avg == null ? "—" : round1(m.w14.prior.avg).toFixed(1);
  ma14DeltaEl.textContent = m.w14.delta == null ? "—" : (m.w14.delta > 0 ? "+" : "") + round1(m.w14.delta).toFixed(1);

  ma28PrevEl.textContent = m.w28.prior.avg == null ? "—" : round1(m.w28.prior.avg).toFixed(1);
  ma28DeltaEl.textContent = m.w28.delta == null ? "—" : (m.w28.delta > 0 ? "+" : "") + round1(m.w28.delta).toFixed(1);

  const req = m.w7.cur.avg == null ? null : m.w7.cur.avg + goalDelta7;
  reqNext7AvgEl.textContent = req == null ? "—" : round1(req).toFixed(1);

  if (req == null) {
    reqNext7HintEl.textContent = "Needs at least 1 weigh-in in the last 7 calendar days.";
  } else {
    reqNext7HintEl.textContent =
      `If your average over the next 7 days is ${round1(req).toFixed(1)}, Δ7 in 7 days will be ${goalDelta7 >= 0 ? "+" : ""}${round1(goalDelta7).toFixed(1)}.`;
  }

  entryStats.textContent =
    `MA7: ${m.w7.cur.count}/7 • MA14: ${m.w14.cur.count}/14 • MA28: ${m.w28.cur.count}/28`;
}

/* ---------------- Events ---------------- */

goalDelta7 = loadGoal();
goalInput.value = goalDelta7;
goalInput.addEventListener("input", () => {
  goalDelta7 = Number(goalInput.value) || 0;
  saveGoal(goalDelta7);
  render();
});

asOfDateISO = loadAsOf();

asOfPrevBtn.addEventListener("click", () => {
  const dates = getEntryDatesAsc(loadEntries());
  asOfDateISO = stepAsOf(clampAsOf(asOfDateISO, dates), dates, -1);
  render();
});

asOfNextBtn.addEventListener("click", () => {
  const dates = getEntryDatesAsc(loadEntries());
  asOfDateISO = stepAsOf(clampAsOf(asOfDateISO, dates), dates, +1);
  render();
});

asOfSelect.addEventListener("change", () => {
  asOfDateISO = asOfSelect.value;
  render();
});

/* ---------------- Add Entry ---------------- */

addBtn.addEventListener("click", () => {
  const date = dateInput.value || todayISO();
  const w = Number(weightInput.value);
  if (!Number.isFinite(w) || w <= 0) return alert("Enter valid weight.");

  const entries = loadEntries();
  entries.push({
    id: crypto.randomUUID(),
    date,
    weight: w,
    notes: notesInput.value || "",
    createdAt: Date.now()
  });

  saveEntries(entries);
  weightInput.value = "";
  render();
});

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear ALL entries?")) return;
  localStorage.removeItem(STORAGE_KEY);
  render();
});

dateInput.value = todayISO();
render();
