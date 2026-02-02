const STORAGE_KEY = "wt_entries_v1";

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
const weeklyChangeEl = document.getElementById("weeklyChange");
const entriesList = document.getElementById("entriesList");
const entryStats = document.getElementById("entryStats");

let editingId = null;

// Utilities
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatISO(iso) {
  const d = isoToDate(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}
function daysBetween(a, b) {
  // whole-day difference between Date objects
  const ms = 24 * 60 * 60 * 1000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((ub - ua) / ms);
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(e => e && typeof e.date === "string" && typeof e.weight === "number")
      .map(e => ({ ...e, notes: typeof e.notes === "string" ? e.notes : "" }));
  } catch {
    return [];
  }
}
function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function startEdit(id) {
  const entries = loadEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  editingId = id;

  function enterEditMode(); weightInput.focus(); {
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

  // Populate the form inputs
  dateInput.value = entry.date;
  weightInput.value = String(entry.weight);
  notesInput.value = entry.notes || "";

  // Change button label so user knows they're updating
  addBtn.textContent = "Update";

  // Helpful on phone
  weightInput.focus();
}


// Core: compute metrics relative to latest logged date
function computeMetrics(entries) {
  if (entries.length === 0) return null;

  // Sort by date asc, then by createdAt asc
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  // Latest date = max date
  const latestDateISO = sorted[sorted.length - 1].date;
  const latestDate = isoToDate(latestDateISO);

  // Latest weight = last entry on that latest date
  const latestWeight = [...sorted].reverse().find(e => e.date === latestDateISO)?.weight ?? null;

  // Helper: entries within [start, end] by date
  function avgInWindow(endDate, windowDays) {
    const start = new Date(endDate);
    start.setDate(start.getDate() - (windowDays - 1));
    const vals = sorted
      .filter(e => {
        const d = isoToDate(e.date);
        return d >= start && d <= endDate;
      })
      .map(e => e.weight);

    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return sum / vals.length;
  }

  const ma7 = avgInWindow(latestDate, 7);
  const ma14 = avgInWindow(latestDate, 14);
  const ma28 = avgInWindow(latestDate, 28);

  // Prior-week MA7 window ends 7 days before latestDate
  const priorEnd = new Date(latestDate);
  priorEnd.setDate(priorEnd.getDate() - 7);
  const ma7PriorWeek = avgInWindow(priorEnd, 7);

  const weeklyChange = (ma7 != null && ma7PriorWeek != null) ? (ma7 - ma7PriorWeek) : null;

  // Counts (helpful to sanity-check)
  function countInWindow(endDate, windowDays) {
    const start = new Date(endDate);
    start.setDate(start.getDate() - (windowDays - 1));
    return sorted.filter(e => {
      const d = isoToDate(e.date);
      return d >= start && d <= endDate;
    }).length;
  }

  const n7 = countInWindow(latestDate, 7);
  const n14 = countInWindow(latestDate, 14);

  return {
    latestDateISO,
    latestWeight,
    ma7, ma14, ma28,
    ma7PriorWeek,
    weeklyChange,
    n7, n14
  };
}

function render() {
  const entries = loadEntries();

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
    <div class="n">${(e.notes || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</div>
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
      const next = loadEntries().filter(e => e.id !== id);

if (editingId === id) {
  editingId = null;
  addBtn.textContent = "Add";
  weightInput.value = "";
  notesInput.value = "";
  dateInput.value = todayISO();
}

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
    return;
  }

  latestDateEl.textContent = formatISO(m.latestDateISO);
  latestWeightEl.textContent = (m.latestWeight == null) ? "—" : round1(m.latestWeight).toFixed(1);

  ma7El.textContent = (m.ma7 == null) ? "—" : round1(m.ma7).toFixed(1);
  ma14El.textContent = (m.ma14 == null) ? "—" : round1(m.ma14).toFixed(1);
  ma28El.textContent = (m.ma28 == null) ? "—" : round1(m.ma28).toFixed(1);

  if (m.weeklyChange == null) {
    weeklyChangeEl.textContent = "—";
  } else {
    const val = round1(m.weeklyChange);
    const sign = val > 0 ? "+" : "";
    weeklyChangeEl.textContent = `${sign}${val.toFixed(1)}`;
  }

  entryStats.textContent = `Entries in last 7 days: ${m.n7} • last 14 days: ${m.n14} • Weekly change needs ~14 days of data.`;
}

// Add or Update entry
addBtn.addEventListener("click", () => {
  const date = dateInput.value || todayISO();
  const w = Number(weightInput.value);
  if (!date) return alert("Pick a date.");
  if (!Number.isFinite(w) || w <= 0) return alert("Enter a valid weight (> 0).");

  const notes = (notesInput.value || "").trim();
  const entries = loadEntries();

  if (editingId) {
    // UPDATE existing entry
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx === -1) {
      // If somehow missing, fall back to add
      entries.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
        date,
        weight: w,
        notes,
        createdAt: Date.now()
      });
    } else {
      // Preserve createdAt so ordering stays sensible
      entries[idx] = { ...entries[idx], date, weight: w, notes };
    }

    editingId = null;
    addBtn.textContent = "Add";
  } else {
    // ADD new entry
    entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      date,
      weight: w,
      notes,
      createdAt: Date.now()
    });
  }

  saveEntries(entries);

  // reset weight + notes for convenience; keep date on today
  weightInput.value = "";
  notesInput.value = "";
  dateInput.value = todayISO();

  render();
});


  // reset weight + notes for convenience; keep date on today
  weightInput.value = "";
  notesInput.value = "";
  dateInput.value = todayISO();

  render();
});

// Clear all
clearBtn.addEventListener("click", () => {
  const ok = confirm("Clear ALL entries stored on this device?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  render();
});

// Init
dateInput.value = todayISO();
render();

// Cancel edit
cancelBtn.addEventListener("click", () => {
  exitEditMode();
});




