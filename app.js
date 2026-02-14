const STORAGE_KEY = "wt_entries_v1";
const GOAL_KEY = "wt_goal_delta7_v1";
const F_KEY = "wt_plan_from_v1";
const APP_VERSION = "2026-02-14.6";

// ---------- DOM ----------
const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) appVersionEl.textContent = APP_VERSION;

// Quick Add
const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const notesInput = document.getElementById("notesInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const cancelBtn = document.getElementById("cancelBtn");

// Entries
const entriesList = document.getElementById("entriesList");
const entryStats = document.getElementById("entryStats");

// Latest cards
const latestDateEl = document.getElementById("latestDate");
const latestWeightEl = document.getElementById("latestWeight");

// Dashboard (B)
const asOfDisplayEl = document.getElementById("asOfDateDisplay");
const bPrevBtn = document.getElementById("bPrev");
const bNextBtn = document.getElementById("bNext");
const bSelect = document.getElementById("bSelect");

// Plan (F)
const fPrevBtn = document.getElementById("asOfPrev");
const fNextBtn = document.getElementById("asOfNext");
const fSelect = document.getElementById("asOfSelect");
const goalInput = document.getElementById("goalDelta7");

const reqNext7AvgEl = document.getElementById("reqNext7Avg");
const reqNext7HintEl = document.getElementById("reqNext7Hint");

const planWindowRangeEl = document.getElementById("planWindowRange");
const planTodayEl = document.getElementById("planToday");

const reqRemainingAvgEl = document.getElementById("reqRemainingAvg");
const reqRemainingHintEl = document.getElementById("reqRemainingHint");

// Helpers
function el(id) { return document.getElementById(id); }

// ---------- STATE ----------
let editingId = null;

// B defaults to today each load (not persisted)
let bISO = todayISO();

// F persists
let fISO = loadPlanFrom() || todayISO();

// Goal persists
let goalDelta7 = loadGoalDelta7();

// ---------- UTIL ----------
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Local-noon dates to avoid DST weirdness.
function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function dateToISO(dateObj) {
  const d = new Date(dateObj);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(startISO, endISO) {
  const a = isoToDate(startISO);
  const b = isoToDate(endISO);
  const ms = b - a;
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function formatISO(iso) {
  const d = isoToDate(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function escapeHtml(s) {
  return String(s || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatMaybeNumber(x) {
  return (x == null) ? "—" : round1(x).toFixed(1);
}

function formatDelta(x) {
  if (x == null) return "—";
  const v = round1(x);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function parseGoal(text) {
  const raw = String(text || "").trim().replace(",", ".");
  const v = Number(raw);
  return Number.isFinite(v) ? v : 0.0;
}

function formatRange(endISO, windowDays) {
  const end = isoToDate(endISO);
  const start = addDays(end, -(windowDays - 1));
  return `${formatISO(dateToISO(start))} → ${formatISO(endISO)}`;
}

function clampISO(iso, startISO, endISO) {
  if (iso < startISO) return startISO;
  if (iso > endISO) return endISO;
  return iso;
}

function stepISO(iso, direction) {
  const d = isoToDate(iso);
  const next = addDays(d, direction);
  return dateToISO(next);
}

// ---------- STORAGE ----------
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(e => e && typeof e.date === "string" && typeof e.weight === "number")
      .map(e => ({
        ...e,
        notes: typeof e.notes === "string" ? e.notes : ""
      }));
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function ensureIds(entries) {
  let changed = false;
  for (const e of entries) {
    if (!e.id) {
      e.id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      changed = true;
    }
    if (typeof e.createdAt !== "number") {
      e.createdAt = Date.now();
      changed = true;
    }
  }
  if (changed) saveEntries(entries);
  return entries;
}

function loadGoalDelta7() {
  const raw = localStorage.getItem(GOAL_KEY);
  const v = raw == null ? 0.0 : Number(raw);
  return Number.isFinite(v) ? v : 0.0;
}

function saveGoalDelta7(v) {
  localStorage.setItem(GOAL_KEY, String(v));
}

function loadPlanFrom() {
  const iso = localStorage.getItem(F_KEY);
  return (typeof iso === "string" && iso.length === 10) ? iso : null;
}

function savePlanFrom(iso) {
  if (!iso) localStorage.removeItem(F_KEY);
  else localStorage.setItem(F_KEY, iso);
}

// ---------- DATE LISTS ----------
function getSortedEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function getLatestEntryInfo(entries) {
  if (!entries.length) return { latestDateISO: null, latestWeight: null };
  const sorted = getSortedEntries(entries);
  const latestDateISO = sorted[sorted.length - 1].date;
  const latestWeight = [...sorted].reverse().find(e => e.date === latestDateISO)?.weight ?? null;
  return { latestDateISO, latestWeight };
}

function makeReasonableDateRange(entries) {
  const today = isoToDate(todayISO());

  if (!entries.length) {
    const start = addDays(today, -60);
    const end = addDays(today, +30);
    return { startISO: dateToISO(start), endISO: dateToISO(end) };
  }

  const sorted = getSortedEntries(entries);
  const earliest = isoToDate(sorted[0].date);
  const latest = isoToDate(sorted[sorted.length - 1].date);

  const start = (addDays(latest, -120) > earliest) ? addDays(latest, -120) : earliest;

  const maxEndBase = (today > latest) ? today : latest;
  const end = addDays(maxEndBase, +30);

  return { startISO: dateToISO(start), endISO: dateToISO(end) };
}

function buildISOListInclusive(startISO, endISO) {
  const start = isoToDate(startISO);
  const end = isoToDate(endISO);
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(dateToISO(d));
  return out;
}

// ---------- METRICS ----------
function windowStats(sortedEntries, endDateObj, windowDays) {
  const start = addDays(endDateObj, -(windowDays - 1));
  const vals = [];
  for (const e of sortedEntries) {
    const d = isoToDate(e.date);
    if (d >= start && d <= endDateObj) vals.push(e.weight);
  }
  if (vals.length === 0) return { avg: null, count: 0, windowDays };
  const sum = vals.reduce((a, b) => a + b, 0);
  return { avg: sum / vals.length, count: vals.length, windowDays };
}

function currentAndPrior(sortedEntries, endDateObj, windowDays) {
  const current = windowStats(sortedEntries, endDateObj, windowDays);
  const priorEnd = addDays(endDateObj, -windowDays);
  const prior = windowStats(sortedEntries, priorEnd, windowDays);

  const delta =
    (current.avg != null && prior.avg != null)
      ? (current.avg - prior.avg)
      : null;

  return { current, prior, delta };
}

function computeDashboardMetrics(entries, endISO) {
  const sorted = getSortedEntries(entries);
  const endDate = isoToDate(endISO);

  const mk = (n) => currentAndPrior(sorted, endDate, n);

  const w3 = mk(3);
  const w7 = mk(7);
  const w14 = mk(14);
  const w28 = mk(28);
  const w56 = mk(56);
  const w112 = mk(112);

  return {
    ma3: w3.current.avg, ma3Count: w3.current.count, ma3Prior: w3.prior.avg, ma3PriorCount: w3.prior.count, change3: w3.delta,
    ma7: w7.current.avg, ma7Count: w7.current.count, ma7Prior: w7.prior.avg, ma7PriorCount: w7.prior.count, change7: w7.delta,
    ma14: w14.current.avg, ma14Count: w14.current.count, ma14Prior: w14.prior.avg, ma14PriorCount: w14.prior.count, change14: w14.delta,
    ma28: w28.current.avg, ma28Count: w28.current.count, ma28Prior: w28.prior.avg, ma28PriorCount: w28.prior.count, change28: w28.delta,
    ma56: w56.current.avg, ma56Count: w56.current.count, ma56Prior: w56.prior.avg, ma56PriorCount: w56.prior.count, change56: w56.delta,
    ma112: w112.current.avg, ma112Count: w112.current.count, ma112Prior: w112.prior.avg, ma112PriorCount: w112.prior.count, change112: w112.delta
  };
}

// Target next-7 avg driven by F
function requiredNext7AvgForF(entries, fISO, goal) {
  const mF = computeDashboardMetrics(entries, fISO);
  if (mF.ma7 == null) return { req: null, ma7AtF: null, countAtF: mF.ma7Count };
  return { req: mF.ma7 + goal, ma7AtF: mF.ma7, countAtF: mF.ma7Count };
}

// Daily weights (latest per day wins)
function dailyWeightsMap(entries) {
  const byDate = new Map();
  const sorted = getSortedEntries(entries);
  for (const e of sorted) byDate.set(e.date, e.weight);
  return byDate;
}

// Remaining-days required average (uses TODAY for progress; shows coverage)
function requiredRemainingAvgDaily(entries, fISO, target7Avg) {
  const fStart = fISO;
  const fEndISO = dateToISO(addDays(isoToDate(fISO), 6));
  const today = todayISO();

  // progress is based on real today, clamped into plan window
  const progressISO = clampISO(today, fStart, fEndISO);
  const elapsedDays = diffDays(fStart, progressISO) + 1; // 1..7
  const remainingDays = 7 - elapsedDays; // 6..0

  const byDay = dailyWeightsMap(entries);

  let sumKnown = 0;
  let knownCount = 0;

  for (let i = 0; i < elapsedDays; i++) {
    const dayISO = dateToISO(addDays(isoToDate(fStart), i));
    const w = byDay.get(dayISO);
    if (typeof w === "number" && Number.isFinite(w)) {
      sumKnown += w;
      knownCount++;
    }
  }

  const missingElapsed = elapsedDays - knownCount;

  if (remainingDays === 0) {
    const achievedIfAllKnown = (knownCount === 7) ? (sumKnown / 7) : null;
    return { req: null, elapsedDays, remainingDays, knownCount, missingElapsed, achievedIfAllKnown, fEndISO, progressISO };
  }

  // Assumes 1 weigh-in per remaining day (denominator = remainingDays)
  const totalTargetSum = target7Avg * 7;
  const remainingTargetSum = totalTargetSum - sumKnown;
  const req = remainingTargetSum / remainingDays;

  return { req, elapsedDays, remainingDays, knownCount, missingElapsed, fEndISO, progressISO };
}

// ---------- EDIT MODE ----------
function enterEditMode() {
  addBtn.textContent = "Update entry";
  if (cancelBtn) cancelBtn.style.display = "inline-block";
}

function exitEditMode() {
  editingId = null;
  addBtn.textContent = "Add entry";
  if (cancelBtn) cancelBtn.style.display = "none";

  weightInput.value = "";
  notesInput.value = "";
  dateInput.value = todayISO();
}

function startEdit(id) {
  const entries = loadEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  editingId = id;
  dateInput.value = entry.date;
  weightInput.value = String(entry.weight);
  notesInput.value = entry.notes || "";

  enterEditMode();
  weightInput.focus();
}

// ---------- RENDER ----------
function render() {
  const entries = ensureIds(loadEntries());
  const sorted = getSortedEntries(entries);

  // Latest cards
  const latest = getLatestEntryInfo(entries);
  if (latestDateEl) latestDateEl.textContent = latest.latestDateISO ? formatISO(latest.latestDateISO) : "—";
  if (latestWeightEl) latestWeightEl.textContent = (latest.latestWeight == null) ? "—" : round1(latest.latestWeight).toFixed(1);

  // Selector range
  const { startISO, endISO } = makeReasonableDateRange(entries);
  const isoList = buildISOListInclusive(startISO, endISO);

  // Clamp B and F
  bISO = clampISO(bISO, startISO, endISO);
  fISO = clampISO(fISO, startISO, endISO);

  // Populate selects (rebuild only if size changed)
  if (bSelect && bSelect.options.length !== isoList.length) {
    bSelect.innerHTML = isoList.map(iso => {
      const label = (iso === todayISO()) ? `${formatISO(iso)} (Today)` : formatISO(iso);
      return `<option value="${iso}">${label}</option>`;
    }).join("");
  }
  if (fSelect && fSelect.options.length !== isoList.length) {
    fSelect.innerHTML = isoList.map(iso => {
      const label = (iso === todayISO()) ? `${formatISO(iso)} (Today)` : formatISO(iso);
      return `<option value="${iso}">${label}</option>`;
    }).join("");
  }

  if (bSelect) bSelect.value = bISO;
  if (fSelect) fSelect.value = fISO;

  // B display
  if (asOfDisplayEl) asOfDisplayEl.textContent = formatISO(bISO);

  // Dashboard metrics (B-driven)
  const mB = computeDashboardMetrics(entries, bISO);

  const specs = [
    { n: 3, k: "3" },
    { n: 7, k: "7" },
    { n: 14, k: "14" },
    { n: 28, k: "28" },
    { n: 56, k: "56" },
    { n: 112, k: "112" }
  ];

  for (const s of specs) {
    const k = s.k;
    const avg = mB[`ma${k}`];
    const prior = mB[`ma${k}Prior`];
    const delta = mB[`change${k}`];
    const cCur = mB[`ma${k}Count`];
    const cPrev = mB[`ma${k}PriorCount`];

    const vEl = el(`ma${k}`);
    const pEl = el(`ma${k}Prev`);
    const dEl = el(`ma${k}Delta`);
    const rEl = el(`ma${k}Range`);
    const covCurEl = el(`ma${k}CovCur`);
    const covPrevEl = el(`ma${k}CovPrev`);

    if (vEl) vEl.textContent = formatMaybeNumber(avg);
    if (pEl) pEl.textContent = formatMaybeNumber(prior);
    if (dEl) dEl.textContent = formatDelta(delta);
    if (rEl) rEl.textContent = formatRange(bISO, s.n);
    if (covCurEl) covCurEl.textContent = `${cCur}/${s.n}`;
    if (covPrevEl) covPrevEl.textContent = `${cPrev}/${s.n}`;
  }

  // Plan window line (F → F+6) + today
  if (planWindowRangeEl) {
    const fEndISO = dateToISO(addDays(isoToDate(fISO), 6));
    planWindowRangeEl.textContent = `${formatISO(fISO)} → ${formatISO(fEndISO)}`;
  }
  if (planTodayEl) planTodayEl.textContent = formatISO(todayISO());

  // Plan estimator #1: target next-7 avg starting at F
  const est = requiredNext7AvgForF(entries, fISO, goalDelta7);
  const target7 = est.req;

  if (reqNext7AvgEl) reqNext7AvgEl.textContent = (target7 == null) ? "—" : round1(target7).toFixed(1);

  if (reqNext7HintEl) {
    if (target7 == null) {
      reqNext7HintEl.textContent = `Needs at least 1 weigh-in in the 7-day window ending on ${formatISO(fISO)}.`;
    } else {
      const cov = `${est.countAtF}/7`;
      reqNext7HintEl.textContent =
        `Based on MA7 at ${formatISO(fISO)} (${round1(est.ma7AtF).toFixed(1)}, coverage ${cov}). Target 7-day average for the plan window is ${round1(target7).toFixed(1)}.`;
    }
  }

  // Plan estimator #2: required avg for remaining plan days (uses TODAY; shows coverage)
  if (reqRemainingAvgEl && reqRemainingHintEl) {
    if (target7 == null) {
      reqRemainingAvgEl.textContent = "—";
      reqRemainingHintEl.textContent = "Compute the target next-7 average first (it depends on MA7 at F).";
    } else {
      const r = requiredRemainingAvgDaily(entries, fISO, target7);

      if (r.remainingDays === 0) {
        reqRemainingAvgEl.textContent = "—";
        if (r.knownCount === 7 && r.achievedIfAllKnown != null) {
          reqRemainingHintEl.textContent =
            `Plan window ended today. Achieved 7-day average: ${round1(r.achievedIfAllKnown).toFixed(1)} (target was ${round1(target7).toFixed(1)}).`;
        } else {
          reqRemainingHintEl.textContent =
            `Plan window ended today. Coverage during plan: ${r.knownCount}/7 days logged (missing ${r.missingElapsed}).`;
        }
      } else {
        reqRemainingAvgEl.textContent = round1(r.req).toFixed(1);

        const covText = `${r.knownCount}/${r.elapsedDays} elapsed day(s) logged`;
        const missText = (r.missingElapsed > 0) ? ` (missing ${r.missingElapsed})` : "";
        reqRemainingHintEl.textContent =
          `So far: ${covText}${missText}. Remaining: ${r.remainingDays} day(s). Assumes 1 weigh-in per remaining day to hit the plan-window target (${round1(target7).toFixed(1)}).`;
      }
    }
  }

  // Entries list (latest first)
  const display = [...sorted].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  if (entriesList) {
    entriesList.innerHTML = "";
    if (!display.length) {
      entriesList.innerHTML = `<div class="tiny muted">No entries yet. Add your first weigh-in above.</div>`;
    } else {
      for (const e of display) {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
          <div class="d">${formatISO(e.date)}</div>
          <div>
            <div class="w">${round1(e.weight).toFixed(1)}</div>
            <div class="n">${escapeHtml(e.notes || "")}</div>
          </div>
          <button data-edit-id="${e.id}" aria-label="Edit">Edit</button>
          <button data-id="${e.id}" aria-label="Delete">Delete</button>
        `;
        entriesList.appendChild(row);
      }
    }

    entriesList.querySelectorAll("button[data-edit-id]").forEach(btn => {
      btn.addEventListener("click", () => startEdit(btn.getAttribute("data-edit-id")));
    });

    entriesList.querySelectorAll("button[data-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (editingId === id) exitEditMode();
        saveEntries(loadEntries().filter(e => e.id !== id));
        render();
      });
    });
  }

  // Entries stat line (simple)
  if (entryStats) {
    if (!sorted.length) entryStats.textContent = "—";
    else entryStats.textContent = `${sorted.length} entries • ${formatISO(sorted[0].date)} → ${formatISO(sorted[sorted.length - 1].date)}`;
  }
}

// ---------- EVENTS ----------

// Goal input
if (goalInput) {
  goalInput.value = String(goalDelta7);
  goalInput.addEventListener("input", () => {
    goalDelta7 = parseGoal(goalInput.value);
    saveGoalDelta7(goalDelta7);
    render();
  });
}

// Plan (F) controls
if (fPrevBtn) {
  fPrevBtn.addEventListener("click", () => {
    fISO = stepISO(fISO, -1);
    savePlanFrom(fISO);
    render();
  });
}
if (fNextBtn) {
  fNextBtn.addEventListener("click", () => {
    fISO = stepISO(fISO, +1);
    savePlanFrom(fISO);
    render();
  });
}
if (fSelect) {
  fSelect.addEventListener("change", () => {
    fISO = fSelect.value || todayISO();
    savePlanFrom(fISO);
    render();
  });
}

// Dashboard (B) controls
if (bPrevBtn) {
  bPrevBtn.addEventListener("click", () => {
    bISO = stepISO(bISO, -1);
    render();
  });
}
if (bNextBtn) {
  bNextBtn.addEventListener("click", () => {
    bISO = stepISO(bISO, +1);
    render();
  });
}
if (bSelect) {
  bSelect.addEventListener("change", () => {
    bISO = bSelect.value || todayISO();
    render();
  });
}

// Add / Update
addBtn.addEventListener("click", () => {
  const date = dateInput.value || todayISO();
  const w = Number(weightInput.value);

  if (!date) return alert("Pick a date.");
  if (!Number.isFinite(w) || w <= 0) return alert("Enter a valid weight (> 0).");

  const notes = (notesInput.value || "").trim();
  const entries = loadEntries();

  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx !== -1) {
      entries[idx] = { ...entries[idx], date, weight: w, notes };
    } else {
      entries.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
        date,
        weight: w,
        notes,
        createdAt: Date.now()
      });
    }
    exitEditMode();
  } else {
    entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      date,
      weight: w,
      notes,
      createdAt: Date.now()
    });

    weightInput.value = "";
    notesInput.value = "";
    dateInput.value = todayISO();
  }

  saveEntries(entries);
  render();
});

// Clear all
clearBtn.addEventListener("click", () => {
  if (!confirm("Clear ALL entries stored on this device?")) return;
  localStorage.removeItem(STORAGE_KEY);
  exitEditMode();
  render();
});

// Cancel edit
if (cancelBtn) cancelBtn.addEventListener("click", () => exitEditMode());

// Init
dateInput.value = todayISO();
exitEditMode();
render();





