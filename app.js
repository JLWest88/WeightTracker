const STORAGE_KEY = "wt_entries_v1";
const GOAL_KEY = "wt_goal_delta7_v1";
const ASOF_KEY = "wt_asof_date_v1";
const APP_VERSION = "2026-02-04.3";

// Version display
const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) appVersionEl.textContent = APP_VERSION;

// Quick Add
const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const notesInput = document.getElementById("notesInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const cancelBtn = document.getElementById("cancelBtn");

// Top metrics
const latestDateEl = document.getElementById("latestDate");
const latestWeightEl = document.getElementById("latestWeight");

// MA cards
const ma7El = document.getElementById("ma7");
const ma14El = document.getElementById("ma14");
const ma28El = document.getElementById("ma28");

const ma7PrevEl = document.getElementById("ma7Prev");
const ma7DeltaEl = document.getElementById("ma7Delta");

const ma14PrevEl = document.getElementById("ma14Prev");
const ma14DeltaEl = document.getElementById("ma14Delta");

const ma28PrevEl = document.getElementById("ma28Prev");
const ma28DeltaEl = document.getElementById("ma28Delta");

// As-of controls (from the HTML you added)
const asOfDisplayEl = document.getElementById("asOfDateDisplay");
const asOfPrevBtn = document.getElementById("asOfPrev");
const asOfNextBtn = document.getElementById("asOfNext");
const asOfSelect = document.getElementById("asOfSelect");

// Goal + required next-7 avg (from the HTML you added inside MA7 card)
const goalInput = document.getElementById("goalDelta7");
const reqNext7AvgEl = document.getElementById("reqNext7Avg");
const reqNext7HintEl = document.getElementById("reqNext7Hint");

// Entries UI
const entriesList = document.getElementById("entriesList");
const entryStats = document.getElementById("entryStats");

let editingId = null;
let asOfDateISO = null;
let goalDelta7 = 0.0;

// -------- Utilities --------

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Use local-noon dates to avoid DST edge weirdness.
function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function formatISO(iso) {
  const d = isoToDate(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
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

function formatMaybeNumber(x) {
  return (x == null) ? "—" : round1(x).toFixed(1);
}

function formatDelta(x) {
  if (x == null) return "—";
  const val = round1(x);
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}`;
}

function setTextIfEl(el, text) {
  if (el) el.textContent = text;
}

// -------- Storage --------

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

function loadAsOfDate() {
  return localStorage.getItem(ASOF_KEY);
}

function saveAsOfDate(iso) {
  if (!iso) localStorage.removeItem(ASOF_KEY);
  else localStorage.setItem(ASOF_KEY, iso);
}

// -------- As-of helpers --------

function getEntryDatesAsc(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  const dates = [];
  for (const e of sorted) {
    if (dates.length === 0 || dates[dates.length - 1] !== e.date) dates.push(e.date);
  }
  return dates;
}

function clampAsOfToEntries(asOf, entryDatesAsc) {
  if (!entryDatesAsc.length) return null;
  if (!asOf) return entryDatesAsc[entryDatesAsc.length - 1];
  if (entryDatesAsc.includes(asOf)) return asOf;

  const earlier = entryDatesAsc.filter(d => d <= asOf);
  return earlier.length ? earlier[earlier.length - 1] : entryDatesAsc[0];
}

function stepAsOf(asOf, entryDatesAsc, direction) {
  if (!asOf) return null;
  const idx = entryDatesAsc.indexOf(asOf);
  if (idx === -1) return asOf;
  const nextIdx = Math.min(entryDatesAsc.length - 1, Math.max(0, idx + direction));
  return entryDatesAsc[nextIdx];
}

function requiredNext7Avg(ma7CurrentAvg, goal) {
  if (ma7CurrentAvg == null || goal == null || Number.isNaN(goal)) return null;
  return ma7CurrentAvg + goal;
}

// -------- Edit mode --------

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

// -------- Metrics (time travel) --------

function computeMetrics(entries, asOfISO) {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  const entryDatesAsc = getEntryDatesAsc(sorted);
  const asOfClamped = clampAsOfToEntries(asOfISO, entryDatesAsc);
  if (!asOfClamped) return null;

  const asOfDate = isoToDate(asOfClamped);

  // Dataset-latest (unchanged baseline cards)
  const latestDateISO = sorted[sorted.length - 1].date;
  const latestWeight = [...sorted].reverse().find(e => e.date === latestDateISO)?.weight ?? null;

  function windowStats(endDate, windowDays) {
    const start = addDays(endDate, -(windowDays - 1));

    const vals = [];
    for (const e of sorted) {
      const d = isoToDate(e.date);
      if (d >= start && d <= endDate) vals.push(e.weight);
    }

    if (vals.length === 0) return { avg: null, count: 0, windowDays };

    const sum = vals.reduce((a, b) => a + b, 0);
    return { avg: sum / vals.length, count: vals.length, windowDays };
  }

  function currentAndPrior(endDate, windowDays) {
    const current = windowStats(endDate, windowDays);
    const priorEnd = addDays(endDate, -windowDays);
    const prior = windowStats(priorEnd, windowDays);

    const delta = (current.avg != null && prior.avg != null) ? (current.avg - prior.avg) : null;
    return { current, prior, delta };
  }

  const w7 = currentAndPrior(asOfDate, 7);
  const w14 = currentAndPrior(asOfDate, 14);
  const w28 = currentAndPrior(asOfDate, 28);

  return {
    latestDateISO,
    latestWeight,
    asOfISO: asOfClamped,

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

// -------- Render --------

function render() {
  const entries = ensureIds(loadEntries());

  // entries list (same as your original)
  const display = [...entries].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  entriesList.innerHTML = "";
  if (display.length === 0) {
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

      // If you delete the current as-of date, clamp again next render
      render();
    });
  });

  const m = computeMetrics(entries, asOfDateISO);

  if (!m) {
    setTextIfEl(latestDateEl, "—");
    setTextIfEl(latestWeightEl, "—");

    setTextIfEl(ma7El, "—");
    setTextIfEl(ma14El, "—");
    setTextIfEl(ma28El, "—");

    setTextIfEl(ma7PrevEl, "—");
    setTextIfEl(ma7DeltaEl, "—");
    setTextIfEl(ma14PrevEl, "—");
    setTextIfEl(ma14DeltaEl, "—");
    setTextIfEl(ma28PrevEl, "—");
    setTextIfEl(ma28DeltaEl, "—");

    setTextIfEl(asOfDisplayEl, "—");
    if (asOfSelect) asOfSelect.innerHTML = "";

    setTextIfEl(reqNext7AvgEl, "—");
    setTextIfEl(reqNext7HintEl, "—");

    setTextIfEl(entryStats, "—");
    return;
  }

  // update as-of and persist
  const entryDatesAsc = getEntryDatesAsc(entries);
  asOfDateISO = clampAsOfToEntries(asOfDateISO || m.asOfISO, entryDatesAsc);
  saveAsOfDate(asOfDateISO);

  // top cards remain dataset-latest
  setTextIfEl(latestDateEl, formatISO(m.latestDateISO));
  setTextIfEl(latestWeightEl, (m.latestWeight == null) ? "—" : round1(m.latestWeight).toFixed(1));

  // as-of UI
  setTextIfEl(asOfDisplayEl, asOfDateISO ? formatISO(asOfDateISO) : "—");
  if (asOfSelect) {
    if (asOfSelect.options.length !== entryDatesAsc.length) {
      asOfSelect.innerHTML = entryDatesAsc
        .map(d => `<option value="${d}">${formatISO(d)}</option>`)
        .join("");
    }
    asOfSelect.value = asOfDateISO || "";
  }

  // MA cards
  setTextIfEl(ma7El, formatMaybeNumber(m.ma7));
  setTextIfEl(ma14El, formatMaybeNumber(m.ma14));
  setTextIfEl(ma28El, formatMaybeNumber(m.ma28));

  setTextIfEl(ma7PrevEl, formatMaybeNumber(m.ma7Prior));
  setTextIfEl(ma7DeltaEl, formatDelta(m.change7));

  setTextIfEl(ma14PrevEl, formatMaybeNumber(m.ma14Prior));
  setTextIfEl(ma14DeltaEl, formatDelta(m.change14));

  setTextIfEl(ma28PrevEl, formatMaybeNumber(m.ma28Prior));
  setTextIfEl(ma28DeltaEl, formatDelta(m.change28));

  // forward-looking estimator
  const req = requiredNext7Avg(m.ma7, goalDelta7);
  setTextIfEl(reqNext7AvgEl, (req == null) ? "—" : round1(req).toFixed(1));

  if (reqNext7HintEl) {
    if (m.ma7 == null) {
      reqNext7HintEl.textContent = "Needs at least 1 weigh-in in the last 7 calendar days.";
    } else {
      const cov = `${m.ma7Count}/7`;
      reqNext7HintEl.textContent =
        `If your average weigh-in over the next 7 days is ${round1(req).toFixed(1)}, then Δ7 in 7 days will be ${formatDelta(goalDelta7)} (MA7 coverage today: ${cov}).`;
    }
  }

  // counts
  const parts = [];
  parts.push(`MA7: ${m.ma7Count}/7 entries logged`);
  parts.push(`Prior MA7: ${m.ma7PriorCount}/7`);
  parts.push(`MA14: ${m.ma14Count}/14`);
  parts.push(`Prior MA14: ${m.ma14PriorCount}/14`);
  parts.push(`MA28: ${m.ma28Count}/28`);
  parts.push(`Prior MA28: ${m.ma28PriorCount}/28`);
  entryStats.textContent = parts.join(" • ");
}

// -------- Button wiring --------

// Load saved goal + as-of
goalDelta7 = loadGoalDelta7();
asOfDateISO = loadAsOfDate();

if (goalInput) {
  goalInput.value = String(goalDelta7);
  goalInput.addEventListener("input", () => {
    const raw = String(goalInput.value || "").trim().replace(",", ".");
const v = Number(raw);
goalDelta7 = Number.isFinite(v) ? v : 0.0;
    saveGoalDelta7(goalDelta7);
    render();
  });
}

if (asOfPrevBtn) {
  asOfPrevBtn.addEventListener("click", () => {
    const entries = ensureIds(loadEntries());
    const dates = getEntryDatesAsc(entries);
    asOfDateISO = clampAsOfToEntries(asOfDateISO, dates);
    asOfDateISO = stepAsOf(asOfDateISO, dates, -1);
    saveAsOfDate(asOfDateISO);
    render();
  });
}

if (asOfNextBtn) {
  asOfNextBtn.addEventListener("click", () => {
    const entries = ensureIds(loadEntries());
    const dates = getEntryDatesAsc(entries);
    asOfDateISO = clampAsOfToEntries(asOfDateISO, dates);
    asOfDateISO = stepAsOf(asOfDateISO, dates, +1);
    saveAsOfDate(asOfDateISO);
    render();
  });
}

if (asOfSelect) {
  asOfSelect.addEventListener("change", () => {
    asOfDateISO = asOfSelect.value || null;
    saveAsOfDate(asOfDateISO);
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


