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
const ma7DeltaE

