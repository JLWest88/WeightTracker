const STORAGE_KEY = "wt_entries_v1";

const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const notesInput = document.getElementById("notesInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const cancelBtn = document.getElementById("cancelBtn");

const latestDateEl = document.getElementById("latestDate");
const latestWeightEl = document.getElementById("latestWeight");

// Existing (current) MA displays
const ma7El = document.getElementById("ma7");
const ma14El = document.getElementById("ma14");
const ma28El = document.getElementById("ma28");

// Existing weekly change display (we keep it as the MA7 delta)
const weeklyChangeEl = document.getElementById("weeklyChange");

const entriesList = document.getElementById("entriesList");
const entryStats = document.getElementById("entryStats");

// Optional (new) elements, if you add them to index.html later.
// If they don't exist, the app will still work and will simply not render these fields.
const ma7PrevEl = document.getElementById("ma7Prev");
const ma7DeltaEl = document.getElementById("ma7Delta");

const ma14PrevEl = document.getElementById("ma14Prev");
const ma14DeltaEl = document.getElementById("ma14Delta");

const ma28PrevEl = document.getElementById("ma28Prev");
const ma28DeltaEl = document.getElementById("ma28Delta");

let editingId = null;

// Utilities
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Use local-noon dates for calculations to avoid DST edge weirdness.
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

// Edit mode helpers
function enterEditMode() {
  addBtn.textContent = "Update entry";
  cancelBtn.style.display = "inline-block";
}

function exitEditMode() {
  editingId = null;
  addBtn.textContent = "Add entry";
  cancelBtn.style.display = "none";

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

/**
 * Calendar-windowed trailing stats (missing calendar days are simply absent; we average only existing entries in the window).
 * Window definition:
 *   - Current N-day window ends at endDate (inclusive) and begins at endDate-(N-1) (inclusive).
 *   - Prior N-day window ends at endDate-N (inclusive) and begins at endDate-(2N-1) (inclusive).
 *
 * This makes MA(N) truly "last N calendar days" (relative to latest logged date), not "last N entries."
 */
function computeMetrics(entries) {
  if (entries.length === 0) return null;

  // Sort by date asc, then by createdAt asc (stable within same day)
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  // Latest date = max date present in entries
  const latestDateISO = sorted[sorted.length - 1].date;
  const latestDate = isoToDate(latestDateISO);

  // Latest weight = last entry on that latest date
  const latestWeight = [...sorted].reverse().find(e => e.date === latestDateISO)?.weight ?? null;

  // Helper: stats within [start, end] inclusive by calendar date.
  function windowStats(endDate, windowDays) {
    const start = addDays(endDate, -(windowDays - 1));

    const vals = [];
    for (const e of sorted) {
      const d = isoToDate(e.date);
      if (d >= start && d <= endDate) vals.push(e.weight);
    }

    if (vals.length === 0) {
      return { avg: null, count: 0, windowDays };
    }

    const sum = vals.reduce((a, b) => a + b, 0);
    return { avg: sum / vals.length, count: vals.length, windowDays };
  }

  function currentAndPrior(endDate, windowDays) {
    const current = windowStats(endDate, windowDays);
    const priorEnd = addDays(endDate, -windowDays);
    const prior = windowStats(priorEnd, windowDays);

    const delta =
      (current.avg != null && prior.avg != null)
        ? (current.avg - prior.avg)
        : null;

    return { current, prior, delta };
  }

  const w7 = currentAndPrior(latestDate, 7);
  const w14 = currentAndPrior(latestDate, 14);
  const w28 = currentAndPrior(latestDate, 28);

  return {
    latestDateISO,
    latestWeight,

    // 7-day
    ma7: w7.current.avg,
    ma7Count: w7.current.count,
    ma7Prior: w7.prior.avg,
    ma7PriorCount: w7.prior.count,
    weeklyChange: w7.delta, // kept for existing UI element

    // 14-day
    ma14: w14.current.avg,
    ma14Count: w14.current.count,
    ma14Prior: w14.prior.avg,
    ma14PriorCount: w14.prior.count,
    change14: w14.delta,

    // 28-day
    ma28: w28.current.avg,
    ma28Count: w28.current.count,
    ma28Prior: w28.prior.avg,
    ma28PriorCount: w28.prior.count,
    change28: w28.delta
  };
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

function render() {
  const entries = ensureIds(loadEntries());

  // Sort newest-first for display
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

  // Edit handlers
  entriesList.querySelectorAll("button[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit-id");
      startEdit(id);
    });
  });

  // Delete handlers
  entriesList.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");

      // If deleting the entry currently being edited, cancel edit mode
      if (editingId === id) {
        exitEditMode();
      }

      const next = loadEntries().filter(e => e.id !== id);
      saveEntries(next);
      render();
    });
  });

  // Metrics
  const m = computeMetrics(entries);
  if (!m) {
    latestDateEl.textContent = "—";
    latestWeightEl.textContent = "—";
    ma7El.textContent = "—";
    ma14El.textContent = "—";
    ma28El.textContent = "—";
    weeklyChangeEl.textContent = "—";
    entryStats.textContent = "—";

    // Optional fields
    setTextIfEl(ma7PrevEl, "—");
    setTextIfEl(ma7DeltaEl, "—");
    setTextIfEl(ma14PrevEl, "—");
    setTextIfEl(ma14DeltaEl, "—");
    setTextIfEl(ma28PrevEl, "—");
    setTextIfEl(ma28DeltaEl, "—");
    return;
  }

  latestDateEl.textContent = formatISO(m.latestDateISO);
  latestWeightEl.textContent = (m.latestWeight == null) ? "—" : round1(m.latestWeight).toFixed(1);

  // Current MAs (existing UI)
  ma7El.textContent = formatMaybeNumber(m.ma7);
  ma14El.textContent = formatMaybeNumber(m.ma14);
  ma28El.textContent = formatMaybeNumber(m.ma28);

  // Weekly change (existing UI) = MA7(current) - MA7(prior 7-day window)
  weeklyChangeEl.textContent = formatDelta(m.weeklyChange);

  // Optional: show prior + delta for each window if elements exist
  setTextIfEl(ma7PrevEl, formatMaybeNumber(m.ma7Prior));
  setTextIfEl(ma7DeltaEl, formatDelta(m.weeklyChange));

  setTextIfEl(ma14PrevEl, formatMaybeNumber(m.ma14Prior));
  setTextIfEl(ma14DeltaEl, formatDelta(m.change14));

  setTextIfEl(ma28PrevEl, formatMaybeNumber(m.ma28Prior));
  setTextIfEl(ma28DeltaEl, formatDelta(m.change28));

  // Stats / transparency
  // (These counts are "entries logged within the calendar window", not "days".)
  const parts = [];
  parts.push(`MA7: ${m.ma7Count}/7 entries logged`);
  parts.push(`Prior MA7: ${m.ma7PriorCount}/7`);
  parts.push(`MA14: ${m.ma14Count}/14`);
  parts.push(`Prior MA14: ${m.ma14PriorCount}/14`);
  parts.push(`MA28: ${m.ma28Count}/28`);
  parts.push(`Prior MA28: ${m.ma28PriorCount}/28`);
  entryStats.textContent = parts.join(" • ");
}

// Add or Update entry (wired once, globally)
addBtn.addEventListener("click", () => {
  const date = dateInput.value || todayISO();
  const w = Number(weightInput.value);

  if (!date) return alert("Pick a date.");
  if (!Number.isFinite(w) || w <= 0) return alert("Enter a valid weight (> 0).");

  const notes = (notesInput.value || "").trim();
  const entries = loadEntries();

  if (editingId) {
    // UPDATE
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx !== -1) {
      // Preserve createdAt for stable ordering within the same day
      entries[idx] = { ...entries[idx], date, weight: w, notes };
    } else {
      // fallback add
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
    // ADD
    entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      date,
      weight: w,
      notes,
      createdAt: Date.now()
    });

    // reset weight + notes for convenience; keep date on today
    weightInput.value = "";
    notesInput.value = "";
    dateInput.value = todayISO();
  }

  saveEntries(entries);
  render();
});

// Clear all (wired once)
clearBtn.addEventListener("click", () => {
  const ok = confirm("Clear ALL entries stored on this device?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  exitEditMode();
  render();
});

// Cancel edit (wired once)
cancelBtn.addEventListener("click", () => {
  exitEditMode();
});

// Init
dateInput.value = todayISO();
render();
exitEditMode();
