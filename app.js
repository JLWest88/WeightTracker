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
const ma28R
