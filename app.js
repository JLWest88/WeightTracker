const STORAGE_KEY = "wt_entries_v1";
const GOAL_KEY = "wt_goal_delta7_v1";
const F_KEY = "wt_plan_from_v1";
const APP_VERSION = "2026-02-05.2"; // bump so you can tell cache/version updates apart

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

// MA cards (driven by B)
const ma7El = document.getElementById("ma7");
const ma14El = document.getElementById("ma14");
const ma28El = document.getElementById("ma28");

const ma7PrevEl = document.getElementById("ma7Prev");
const ma7DeltaEl = document.getElementById("ma7Delta");

const ma14PrevEl = document.getElementById("ma14Prev");
const ma14DeltaEl = document.getElementById("ma14Delta");

const ma28PrevEl = document.getElementById("ma28Prev");
const ma28DeltaEl = document.getElementById("ma28Delta");

// NEW: ranges + coverage INSIDE MA cards
const ma7RangeEl = document.getElementById("ma7Range");
const ma14RangeEl = document.getElementById("ma14Range");
const ma28RangeEl = document.getElementById("ma28Range");

const ma7CovCurEl = document.getElementById("ma7CovCur");
const ma7CovPrevEl = document.getElementById("ma7CovPrev");

const ma14CovCurEl = document.getElementById("ma14CovCur");
const ma14CovPrevEl = document.getElementById("ma14CovPrev");

const ma28CovCurEl = document.getElementById("ma28CovCur");
const ma28CovPrevEl = document.getElementById("ma28CovPrev");

// Plan (F)
const fPrevBtn = document.getElementById("asOfPrev");
const fNextBtn = document.getElementById("asOfNext");
const fSelect = document.getElementById("asOfSelect");

const goalInput = document.getElementById("goalDelta7");
const reqNext7AvgEl = document.getElementById("reqNext7Avg");
const reqNext7HintEl = document.getElementById("reqNext7Hint");

// NEW: plan window range display
const planWindowRangeEl = document.getElementById("planWindowRange");

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
  // Allow "-0.3" and also "0,3"
  const raw = String(text || "").trim().replace(",", ".");
  const v = Number(raw);
  return Number.isFinite(v) ? v : 0.0;
}

function formatRange(endISO, windowDays) {
  // Current window only: (end - (N-1)) → end
  const end = isoToDate(endISO);
  const start = addDays(end, -(windowDays - 1));
  return `${formatISO(dateToISO(start))} → ${formatISO(endISO)}`;
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

// ---------- DATE LISTS FOR SELECTORS ----------
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
  // Range: from (max(latest-120d, earliest)) to (max(today, latest)+30d).
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
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(dateToISO(d));
  }
  return out;
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

  const w7 = currentAndPrior(sorted, endDate, 7);
  const w14 = currentAndPrior(sorted, endDate, 14);
  const w28 = currentAndPrior(sorted, endDate, 28);

  return {
    ma7: w7.current.avg,
    ma7Count: w7.current.count,
    ma7Prior: w7.prior.avg,
    ma7PriorCount: w7.prior.count,
    change7: w7.delta,

    ma14: w14.current.avg,
    ma14Count: w14.current.count,
    ma14Prior: w14.prior.avg,
    ma14PriorCount: w14.prior.count,
    change14: w14.delta,

    ma28: w28.current.avg,
    ma28Count: w28.current.count,
    ma28Prior: w28.prior.avg,
    ma28PriorCount: w28.prior.count,
    change28: w28.delta
  };
}

// Required next-7 avg driven by F
function requiredNext7AvgForF(entries, fISO, goal) {
  const mF = computeDashboardMetrics(entries, fISO);
  if (mF.ma7 == null) return { req: null, ma7AtF: null, countAtF: mF.ma7Count };
  return { req: mF.ma7 + goal, ma7AtF: mF.ma7, countAtF: mF.ma7Count };
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

  // Latest cards (dataset-latest)
  const latest = getLatestEntryInfo(entries);
  if (latestDateEl) latestDateEl.textContent = latest.latestDateISO ? formatISO(latest.latestDateISO) : "—";
  if (latestWeightEl) latestWeightEl.textContent = (latest.latestWeight == null) ? "—" : round1(latest.latestWeight).toFixed(1);

  // Build selector range
  const { startISO, endISO } = makeReasonableDateRange(entries);
  const isoList = buildISOListInclusive(startISO, endISO);

  // Clamp B and F into range
  bISO = clampISO(bISO, startISO, endISO);
  fISO = clampISO(fISO, startISO, endISO);

  // Populate selects (only rebuild if size changed)
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

  // Show B on dashboard as-of display
  if (asOfDisplayEl) asOfDisplayEl.textContent = formatISO(bISO);

  // Dashboard metrics (B-driven)
  const mB = computeDashboardMetrics(entries, bISO);

  if (ma7El) ma7El.textContent = formatMaybeNumber(mB.ma7);
  if (ma14El) ma14El.textContent = formatMaybeNumber(mB.ma14);
  if (ma28El) ma28El.textContent = formatMaybeNumber(mB.ma28);

  if (ma7PrevEl) ma7PrevEl.textContent = formatMaybeNumber(mB.ma7Prior);
  if (ma7DeltaEl) ma7DeltaEl.textContent = formatDelta(mB.change7);

  if (ma14PrevEl) ma14PrevEl.textContent = formatMaybeNumber(mB.ma14Prior);
  if (ma14DeltaEl) ma14DeltaEl.textContent = formatDelta(mB.change14);

  if (ma28PrevEl) ma28PrevEl.textContent = formatMaybeNumber(mB.ma28Prior);
  if (ma28DeltaEl) ma28DeltaEl.textContent = formatDelta(mB.change28);

  // NEW: current ranges for MA cards (no prior range shown)
  if (ma7RangeEl) ma7RangeEl.textContent = formatRange(bISO, 7);
  if (ma14RangeEl) ma14RangeEl.textContent = formatRange(bISO, 14);
  if (ma28RangeEl) ma28RangeEl.textContent = formatRange(bISO, 28);

  // NEW: coverage counts inside cards
  if (ma7CovCurEl) ma7CovCurEl.textContent = `${mB.ma7Count}/7`;
  if (ma7CovPrevEl) ma7CovPrevEl.textContent = `${mB.ma7PriorCount}/7`;

  if (ma14CovCurEl) ma14CovCurEl.textContent = `${mB.ma14Count}/14`;
  if (ma14CovPrevEl) ma14CovPrevEl.textContent = `${mB.ma14PriorCount}/14`;

  if (ma28CovCurEl) ma28CovCurEl.textContent = `${mB.ma28Count}/28`;
  if (ma28CovPrevEl) ma28CovPrevEl.textContent = `${mB.ma28PriorCount}/28`;

  // NEW: Plan window range (Option A = F → F+6)
  if (planWindowRangeEl) {
    const fStart = isoToDate(fISO);
    const fEndISO = dateToISO(addDays(fStart, 6));
    planWindowRangeEl.textContent = `${formatISO(fISO)} → ${formatISO(fEndISO)}`;
  }

  // Plan estimator (F-driven)
  const est = requiredNext7AvgForF(entries, fISO, goalDelta7);
  if (reqNext7AvgEl) reqNext7AvgEl.textContent = (est.req == null) ? "—" : round1(est.req).toFixed(1);

  if (reqNext7HintEl) {
    if (est.req == null) {
      reqNext7HintEl.textContent = `Needs at least 1 weigh-in in the 7-day window ending on ${formatISO(fISO)}.`;
    } else {
      const cov = `${est.countAtF}/7`;
      reqNext7HintEl.textContent =
        `Based on MA7 at ${formatISO(fISO)} (${round1(est.ma7AtF).toFixed(1)}, coverage ${cov}). If your average weigh-in over the next 7 days is ${round1(est.req).toFixed(1)}, then Δ7 in 7 days will be ${formatDelta(goalDelta7)}.`;
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
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit-id");
        startEdit(id);
      });
    });

    entriesList.querySelectorAll("button[data-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (editingId === id) exitEditMode();
        const next = loadEntries().filter(e => e.id !== id);
        saveEntries(next);
        render();
      });
    });
  }

  // Entry stats line: now keep it simple (since the MA coverage moved into MA cards)
  if (entryStats) {
    if (!sorted.length) {
      entryStats.textContent = "—";
    } else {
      const first = sorted[0].date;
      const last = sorted[sorted.length - 1].date;
      entryStats.textContent = `${sorted.length} entries • ${formatISO(first)} → ${formatISO(last)}`;
    }
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
  const ok = confirm("Clear ALL entries stored on this device?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  exitEditMode();
  render();
});

// Cancel edit
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    exitEditMode();
  });
}

// Init
dateInput.value = todayISO();
exitEditMode();
render();
