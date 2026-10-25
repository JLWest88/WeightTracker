const STORAGE_KEY = "wt_entries_v1";
const GOAL_KEY = "wt_goal_delta7_v1";
const F_KEY = "wt_plan_from_v1";
const STEP_KCAL_KEY = "wt_step_kcal_v1";
const BUDGET_STEPS_KEY = "wt_budget_steps_v1";
const APP_VERSION = "2026-10-24.4";

// Energy-balance constant: calories per pound of body weight change.
// An approximation (true for fat; mixed tissue varies) — good enough here.
const KCAL_PER_LB = 3500;

// ---------- DOM ----------
const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) appVersionEl.textContent = APP_VERSION;

// Quick Add
const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const caloriesInput = document.getElementById("caloriesInput");
const stepsInput = document.getElementById("stepsInput");
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

// Plan (F) — plan-week start
const fPrevBtn = document.getElementById("asOfPrev");
const fNextBtn = document.getElementById("asOfNext");
const fSelect = document.getElementById("asOfSelect");

// Plan (T) — which day in the plan week you're viewing
const tPrevBtn = document.getElementById("tPrev");
const tNextBtn = document.getElementById("tNext");
const tSelect = document.getElementById("tSelect");

const goalInput = document.getElementById("goalDelta7");

const reqNext7TitleEl = document.getElementById("reqNext7Title");
const reqRemainingTitleEl = document.getElementById("reqRemainingTitle");

const reqNext7AvgEl = document.getElementById("reqNext7Avg");
const reqNext7HintEl = document.getElementById("reqNext7Hint");

const planWindowRangeEl = document.getElementById("planWindowRange");
const planTodayEl = document.getElementById("planToday");

const reqRemainingAvgEl = document.getElementById("reqRemainingAvg");
const reqRemainingHintEl = document.getElementById("reqRemainingHint");

// Today's calorie budget
const calBudgetEl = document.getElementById("calBudget");
const calBudgetHintEl = document.getElementById("calBudgetHint");
const stepsTodayInput = document.getElementById("stepsTodayInput");
const stepKcalInput = document.getElementById("stepKcalInput");

// Energy (B-driven, like the dashboard)
const tdee14El = document.getElementById("tdee14");
const tdee14HintEl = document.getElementById("tdee14Hint");
const tdee28El = document.getElementById("tdee28");
const tdee28HintEl = document.getElementById("tdee28Hint");
const balanceEl = document.getElementById("latestBalance");
const balanceHintEl = document.getElementById("latestBalanceHint");
const energyFitEl = document.getElementById("energyFit");
const energyFitHintEl = document.getElementById("energyFitHint");

// Helpers
function el(id) { return document.getElementById(id); }

// ---------- STATE ----------
let editingId = null;

// B defaults to today each load (not persisted)
let bISO = todayISO();

// F (plan-week start) persists
let fISO = loadPlanFrom() || todayISO();

// T (target day within the plan week). Not persisted: defaults to the next
// un-logged day in the week unless the user pins it with the Target selector.
let tISO = null;
let tManual = false;

// Goal persists
let goalDelta7 = loadGoalDelta7();

// Calorie-budget inputs persist (steps only for the current day)
let stepKcal = loadStepKcal();
let stepsToday = loadBudgetSteps();

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
    const num = (v) => (typeof v === "number" && Number.isFinite(v)) ? v : undefined;
    return arr
      // An entry needs a date plus at least one logged value (weight is no
      // longer required — a day can be calories/steps only).
      .filter(e => e && typeof e.date === "string" &&
        (num(e.weight) != null || num(e.calories) != null || num(e.steps) != null))
      .map(e => ({
        ...e,
        weight: num(e.weight),
        calories: num(e.calories),
        steps: num(e.steps),
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

function loadStepKcal() {
  const v = Number(localStorage.getItem(STEP_KCAL_KEY));
  return (Number.isFinite(v) && v > 0 && v < 1) ? v : 0.04;
}

function saveStepKcal(v) {
  localStorage.setItem(STEP_KCAL_KEY, String(v));
}

// "Steps today" is remembered only for the day it was typed on.
function loadBudgetSteps() {
  try {
    const o = JSON.parse(localStorage.getItem(BUDGET_STEPS_KEY));
    if (o && o.date === todayISO() && Number.isFinite(o.steps) && o.steps >= 0) return o.steps;
  } catch {}
  return null;
}

function saveBudgetSteps(v) {
  if (v == null) localStorage.removeItem(BUDGET_STEPS_KEY);
  else localStorage.setItem(BUDGET_STEPS_KEY, JSON.stringify({ date: todayISO(), steps: v }));
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
  // Latest WEIGH-IN (entries can now be calories/steps only).
  const sorted = getSortedEntries(entries).filter(e => typeof e.weight === "number");
  if (!sorted.length) return { latestDateISO: null, latestWeight: null };
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
    if (typeof e.weight !== "number") continue; // calories/steps-only day
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

// Daily value of one field (latest entry per day wins; missing fields skipped)
function dailyNumberMap(entries, field) {
  const byDate = new Map();
  const sorted = getSortedEntries(entries);
  for (const e of sorted) {
    const v = e[field];
    if (typeof v === "number" && Number.isFinite(v)) byDate.set(e.date, v);
  }
  return byDate;
}

// Daily weights (latest per day wins)
function dailyWeightsMap(entries) {
  return dailyNumberMap(entries, "weight");
}

// Spread catch-up target for the Target day T within the plan week (F..F+6).
// goal is signed: negative = cut, 0 = maintain, positive = gain.
//
// Each day's "gap" = weight(day) - weight(day - 7) (the drop-off). The weekly
// Δ7 goal IS the average of those gaps, so the week needs 7*goal in total.
// Whatever the days counted so far haven't covered is shared EVENLY across
// every remaining day (T included) instead of dumped on T alone:
//     neededGap = (7 * goal - sumOfGapsBeforeT) / (7 - countedBeforeT)
// and the target weight = T's drop-off weight + neededGap.
//
// Symmetric: behind pace tightens each remaining day a little, ahead of pace
// loosens them. "onPace*" is the flat drop-off + goal for contrast.
// Anchored to F + logged data, never to "today".
function planCatchUpTarget(entries, fISO, tISO, goal) {
  const byDay = dailyWeightsMap(entries);
  const days = planWeekDays(fISO);

  let sumGap = 0;
  let counted = 0;
  for (const dISO of days) {
    if (dISO >= tISO) continue; // only days already behind us in the week
    const dropISO = dateToISO(addDays(isoToDate(dISO), -7));
    const w = byDay.get(dISO);
    const drop = byDay.get(dropISO);
    if (
      typeof w === "number" && Number.isFinite(w) &&
      typeof drop === "number" && Number.isFinite(drop)
    ) {
      sumGap += (w - drop);
      counted++;
    }
  }

  const dropTISO = dateToISO(addDays(isoToDate(tISO), -7));
  const dropT = byDay.get(dropTISO);
  const hasDropT = typeof dropT === "number" && Number.isFinite(dropT);

  const remaining = 7 - counted; // days that can still move the week (T included)
  const neededGap = (7 * goal - sumGap) / remaining; // per-day spread gap
  const actual = byDay.get(tISO);
  const hasActual = typeof actual === "number" && Number.isFinite(actual);

  return {
    tISO,
    dropISO: dropTISO,
    dropWeight: hasDropT ? dropT : null,
    counted,
    remaining,
    currentPace: counted > 0 ? (sumGap / counted) : null,
    neededGap,
    targetWeight: hasDropT ? (dropT + neededGap) : null,
    onPaceWeight: hasDropT ? (dropT + goal) : null,
    actualWeight: hasActual ? actual : null
  };
}

// The 7 calendar days of a plan week starting at F.
function planWeekDays(fISO) {
  const out = [];
  for (let i = 0; i < 7; i++) out.push(dateToISO(addDays(isoToDate(fISO), i)));
  return out;
}

// Smart default for the Target day: the first day in the plan week with no
// logged weight yet. If all 7 are logged, fall back to the last day.
function nextUnloggedInWeek(entries, fISO) {
  const byDay = dailyWeightsMap(entries);
  const days = planWeekDays(fISO);
  for (const dISO of days) {
    const w = byDay.get(dISO);
    if (!(typeof w === "number" && Number.isFinite(w))) return dISO;
  }
  return days[days.length - 1];
}

// Whole-plan-week status, in terms of Δ7 (each day vs the same day 7 days
// earlier). The weekly Δ7 goal IS the average of those daily gaps, so:
//   - currentPace        = average gap over the days already scored
//   - requiredRemaining  = average gap the remaining days must hit so the
//                          full 7-day average still equals the goal
// goal is signed (negative = cut). Anchored to F + logged data, never today.
function planWeekStatus(entries, fISO, goal) {
  const byDay = dailyWeightsMap(entries);
  const days = planWeekDays(fISO);

  let sumGap = 0;
  let scored = 0;     // days with both the day and its drop-off logged
  let loggedCount = 0; // days with a weight logged (drop-off may be missing)

  for (const dISO of days) {
    const dropISO = dateToISO(addDays(isoToDate(dISO), -7));
    const w = byDay.get(dISO);
    const drop = byDay.get(dropISO);
    const hasW = typeof w === "number" && Number.isFinite(w);
    const hasDrop = typeof drop === "number" && Number.isFinite(drop);
    if (hasW) loggedCount++;
    if (hasW && hasDrop) { sumGap += (w - drop); scored++; }
  }

  const remaining = 7 - scored;
  const currentPace = scored > 0 ? (sumGap / scored) : null;
  const requiredRemaining = remaining > 0 ? ((7 * goal - sumGap) / remaining) : null;
  const achieved = (scored === 7) ? (sumGap / 7) : null;

  return { scored, loggedCount, remaining, currentPace, requiredRemaining, achieved };
}

function formatPaceStatus(pace, goal) {
  if (pace == null) return "Not enough data yet.";

  if (goal === 0) {
    if (Math.abs(pace) <= 0.3) return "Holding steady (near maintenance).";
    return pace < 0 ? "Trending down." : "Trending up.";
  }

  // Positive "ahead" means doing better than the goal in the goal's direction.
  const ahead = (goal < 0) ? (goal - pace) : (pace - goal);
  if (ahead >= 0.3) return "Ahead of target pace.";
  if (ahead <= -0.3) return "Behind target pace.";
  return "On target pace.";
}

// ---------- ENERGY ----------
// Self-calibrating maintenance (TDEE) estimate over the N days ending at
// endISO:  maintenance = avg calories eaten − (trend change × 3500 / N).
// The trend change uses MA7 at the window's end vs MA7 just before its start,
// so daily water noise stays out of it. Because the estimate calibrates to
// YOUR logging, consistent under/over-logging cancels out — consistency
// matters, accuracy doesn't.
const ENERGY_MIN_CAL_COVERAGE = 0.8; // calories logged on >= 80% of the window
const ENERGY_MIN_MA_DAYS = 3;        // weigh-ins needed in each MA7 endpoint

// gapEst (optional): Map of ISO date → estimated kcal for untracked days the
// fit has solved from the weight response. Those days count toward coverage,
// reported separately as estDays so the hints can say "logged + estimated".
function energyEstimate(entries, endISO, windowDays, gapEst) {
  const sorted = getSortedEntries(entries);
  const calByDay = dailyNumberMap(entries, "calories");
  const stepsByDay = dailyNumberMap(entries, "steps");
  const end = isoToDate(endISO);

  let calSum = 0, calDays = 0, estDays = 0, stepSum = 0, stepDays = 0;
  for (let i = 0; i < windowDays; i++) {
    const dISO = dateToISO(addDays(end, -i));
    const c = calByDay.get(dISO);
    if (typeof c === "number") { calSum += c; calDays++; }
    else if (gapEst && gapEst.has(dISO)) { calSum += gapEst.get(dISO); estDays++; }
    const s = stepsByDay.get(dISO);
    if (typeof s === "number") { stepSum += s; stepDays++; }
  }

  const maEnd = windowStats(sorted, end, 7);
  const maStart = windowStats(sorted, addDays(end, -windowDays), 7);

  const covered = calDays + estDays;
  const avgIn = covered > 0 ? (calSum / covered) : null;
  const avgSteps = stepDays > 0 ? (stepSum / stepDays) : null;

  let maintenance = null;
  let trendDelta = null;
  if (
    avgIn != null &&
    (covered / windowDays) >= ENERGY_MIN_CAL_COVERAGE &&
    maEnd.avg != null && maEnd.count >= ENERGY_MIN_MA_DAYS &&
    maStart.avg != null && maStart.count >= ENERGY_MIN_MA_DAYS
  ) {
    trendDelta = maEnd.avg - maStart.avg; // lb change across the window
    maintenance = avgIn - (trendDelta * KCAL_PER_LB / windowDays);
  }

  return {
    windowDays, avgIn, calDays, estDays, avgSteps, stepDays,
    maEndCount: maEnd.count, maStartCount: maStart.count,
    trendDelta, maintenance
  };
}

// ---------- ENERGY MODEL FIT ----------
// Fits the burn model  burn(day) = base + perStep × steps(day)  to the user's
// own history: choose the parameters whose predicted weight curve — start at
// the trend, add each day's (eaten − burned) ÷ 3500 — best matches the actual
// trend curve. Least squares, pooled across runs of calorie-logged days.
//
// UNTRACKED DAYS: a short gap (≤ GAP_MAX_DAYS) no longer breaks the ledger.
// Each matured gap becomes one extra unknown — the gap's total untracked
// intake — solved from how the weight actually responded afterwards. This
// keeps base/perStep unbiased even though skipped days are usually HIGH days,
// and the solved values feed the maintenance averages (labeled "estimated").
// A gap is solved only once matured (enough follow-up entries exist); until
// then it's reported as pending and stays a hard break. No assumption is made
// about HOW FAST weight responds: the centered 7-day comparison tolerates
// response lags of several days without being told the lag.
//
// The maintenance AVERAGE cannot separate base from steps (one equation, two
// unknowns); the day-to-day VARIATION in steps is what identifies the split.
// So the fit declines, with a reason, when the data can't support it — and the
// budget then falls back to the manual kcal/step setting.
const ENERGY_FIT_LOOKBACK = 56;      // days of history to fit over
const ENERGY_FIT_MIN_POINTS = 21;    // usable days needed
const ENERGY_FIT_MIN_STEP_SD = 1000; // daily-step spread needed to split the model
const GAP_MAX_DAYS = 3;              // longest untracked stretch the fit will solve
const GAP_MATURITY_DAYS = 7;         // follow-up days needed before a gap is solved
const ENERGY_FIT_MAX_GAPS = 5;       // most gaps solvable in one window
const ENERGY_FIT_MAX_LAG = 4;        // longest weight-response lag tried (days)

// Solve A·x = b (small dense system) by Gaussian elimination with partial
// pivoting. Mutates its arguments; returns null if singular.
function solveLinearSystem(A, b) {
  const M = b.length;
  let maxAbs = 0;
  for (const row of A) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
  if (!(maxAbs > 0)) return null;

  for (let col = 0; col < M; col++) {
    let piv = col;
    for (let r = col + 1; r < M; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12 * maxAbs) return null;
    if (piv !== col) {
      const tr = A[col]; A[col] = A[piv]; A[piv] = tr;
      const tb = b[col]; b[col] = b[piv]; b[piv] = tb;
    }
    for (let r = 0; r < M; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < M; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

function fitEnergyModel(entries, endISO) {
  const sorted = getSortedEntries(entries);
  const calByDay = dailyNumberMap(entries, "calories");
  const stepsByDay = dailyNumberMap(entries, "steps");
  const end = isoToDate(endISO);

  // CENTERED 7-day average (window [d−3, d+3], i.e. trailing MA7 shifted +3),
  // optionally shifted further by a response lag: the body may take days to
  // show a day's balance on the scale, so the trend reflecting day d's totals
  // is the centered average at d + lag. Booking against the wrong lag
  // decorrelates the signals and attenuates the split (verified against
  // model-generated data), so the fit tries several lags and keeps the best.
  const trendAt = (dObj, lagDays) => {
    const s = windowStats(sorted, addDays(dObj, 3 + lagDays), 7);
    return (s.avg != null && s.count >= ENERGY_MIN_MA_DAYS) ? s.avg : null;
  };

  // The lookback days, oldest → newest.
  const wByDay = dailyNumberMap(entries, "weight");
  const days = [];
  for (let i = ENERGY_FIT_LOOKBACK - 1; i >= 0; i--) {
    const dObj = addDays(end, -i);
    const iso = dateToISO(dObj);
    days.push({ dObj, iso, cal: calByDay.get(iso), steps: stepsByDay.get(iso), w: wByDay.get(iso) });
  }

  const loggedSteps = days.map(d => d.steps).filter(v => typeof v === "number");
  if (!loggedSteps.length) return { valid: false, reason: "no steps logged in the last 56 days", pendingGaps: [] };
  const meanLoggedSteps = loggedSteps.reduce((a, b) => a + b, 0) / loggedSteps.length;

  // Alternating blocks of calorie-logged days and gaps.
  const hasCal = (d) => typeof d.cal === "number";
  const blocks = [];
  let t = 0;
  while (t < days.length) {
    const type = hasCal(days[t]) ? "cal" : "gap";
    let e = t;
    while (e + 1 < days.length && (hasCal(days[e + 1]) ? "cal" : "gap") === type) e++;
    blocks.push({ type, start: t, end: e });
    t = e + 1;
  }

  // Merge cal blocks across bridgeable gaps. Each bridged gap becomes one
  // unknown (its total untracked intake). A gap is bridged only when:
  //   - it's short (≤ GAP_MAX_DAYS),
  //   - ≥ 8 logged days precede it in the current run (anchoring needs them),
  //   - it's matured: GAP_MATURITY_DAYS of follow-up exist with ≥ 5 calorie
  //     days and ≥ 3 weigh-ins (the weight response that identifies it),
  //   - the window isn't already solving ENERGY_FIT_MAX_GAPS gaps.
  // Otherwise the gap stays a hard break (reported as pending when it's the
  // solvable kind and just needs more follow-up).
  const runs = [];           // { items: [{day, gapIdx}], gapIdxs: [...] }
  const bridgedGaps = [];    // { dayISOs, len, startISO, endISO }
  const pendingGaps = [];    // { startISO, endISO, len, reason }
  let merged = null;
  const closeRun = () => { if (merged && merged.items.length) runs.push(merged); merged = null; };

  for (let b = 0; b < blocks.length; b++) {
    const blk = blocks[b];
    if (blk.type === "cal") {
      if (!merged) merged = { items: [], gapIdxs: [] };
      for (let q = blk.start; q <= blk.end; q++) merged.items.push({ day: days[q], gapIdx: -1 });
      continue;
    }

    // gap block
    const len = blk.end - blk.start + 1;
    if (!merged) continue; // leading gap — nothing to bridge from
    const gapInfo = { startISO: days[blk.start].iso, endISO: days[blk.end].iso, len };

    const followOk = (b + 1 < blocks.length && blocks[b + 1].type === "cal");
    const matureEnd = blk.end + GAP_MATURITY_DAYS;
    let followCal = 0, followW = 0;
    if (matureEnd < days.length) {
      for (let q = blk.end + 1; q <= matureEnd; q++) {
        if (hasCal(days[q])) followCal++;
        if (typeof days[q].w === "number") followW++;
      }
    }
    const matured = matureEnd < days.length && followCal >= 5 && followW >= 3;

    if (len <= GAP_MAX_DAYS && followOk && merged.items.length >= 8 &&
        matured && bridgedGaps.length < ENERGY_FIT_MAX_GAPS) {
      const gapIdx = bridgedGaps.length;
      const dayISOs = [];
      for (let q = blk.start; q <= blk.end; q++) {
        dayISOs.push(days[q].iso);
        merged.items.push({ day: days[q], gapIdx });
      }
      bridgedGaps.push({ ...gapInfo, dayISOs });
      merged.gapIdxs.push(gapIdx);
    } else {
      if (len <= GAP_MAX_DAYS) {
        pendingGaps.push({ ...gapInfo, reason: !matured || !followOk ? "needs more entries after it" : "window already at its gap limit" });
      }
      closeRun();
    }
  }
  closeRun();

  // Pooled least squares for y = base·x1 + perStep·x2 − Σ gapIntake·xG.
  // The actual trend is a centered 7-day AVERAGE of weights, so the model's
  // running totals (days, calories, steps, gap indicators since the anchor)
  // get the SAME centered 7-day smoothing before differencing — otherwise
  // sharp changes compared against a smoothed curve attenuate the estimates
  // (confirmed against model-generated data).
  //
  // The whole system is evaluated at candidate response lags 0..MAX_LAG and
  // the lag with the lowest mean squared error wins — the lag is read off the
  // data, never assumed.

  // Per-run cumulative series (lag-independent), built once.
  const prepared = [];
  const usedSteps = [];
  for (const run of runs) {
    const L = run.items.length;
    if (L < 8) continue; // too short to anchor + smooth + leave a residual

    const cumN = new Array(L), cumC = new Array(L), cumS = new Array(L);
    const cumI = run.gapIdxs.map(() => new Array(L));
    let cN = 0, cC = 0, cS = 0;
    const cI = run.gapIdxs.map(() => 0);
    for (let q = 0; q < L; q++) {
      const it = run.items[q];
      cN += 1;
      cC += (it.gapIdx === -1) ? it.day.cal : 0;
      const st = (typeof it.day.steps === "number") ? it.day.steps : meanLoggedSteps;
      cS += st;
      usedSteps.push(st);
      if (it.gapIdx !== -1) {
        const gi = run.gapIdxs.indexOf(it.gapIdx);
        cI[gi] += 1 / bridgedGaps[it.gapIdx].len; // intake spread evenly over the gap
      }
      cumN[q] = cN; cumC[q] = cC; cumS[q] = cS;
      for (let g = 0; g < cI.length; g++) cumI[g][q] = cI[g];
    }
    prepared.push({ run, L, cumN, cumC, cumS, cumI });
  }

  if (!usedSteps.length) {
    return { valid: false, reason: "not enough connected calorie-logged days yet", points: 0, pendingGaps };
  }
  const mSt = usedSteps.reduce((a, b) => a + b, 0) / usedSteps.length;
  const stepSd = Math.sqrt(usedSteps.reduce((a, b) => a + (b - mSt) * (b - mSt), 0) / usedSteps.length);
  if (stepSd < ENERGY_FIT_MIN_STEP_SD) {
    return { valid: false, reason: `daily steps vary too little (spread ≈ ${Math.round(stepSd)}; needs ${ENERGY_FIT_MIN_STEP_SD}+) to separate base burn from steps`, points: 0, stepSd, pendingGaps };
  }

  const sm = (arr, q) => { let s = 0; for (let j = -3; j <= 3; j++) s += arr[q + j]; return s / 7; };
  const M = 2 + bridgedGaps.length;

  let best = null;
  let anyPoints = 0;
  for (let lag = 0; lag <= ENERGY_FIT_MAX_LAG; lag++) {
    const rows = [];
    for (const pr of prepared) {
      const { run, L, cumN, cumC, cumS, cumI } = pr;
      const a = 3; // anchor index: bridged gaps start at index ≥ 8, so this is clean
      // Keep the data-side trend windows inside the run: beyond its end the
      // weights may reflect an unbridged gap's unknown intake.
      const pMax = L - 4 - lag;
      if (pMax <= a) continue;
      const Ta = trendAt(run.items[a].day.dObj, lag);
      if (Ta == null) continue;
      const nA = sm(cumN, a), cA = sm(cumC, a), sA = sm(cumS, a);
      const iA = cumI.map(arr => sm(arr, a));

      for (let p = a + 1; p <= pMax; p++) {
        const Tp = trendAt(run.items[p].day.dObj, lag);
        if (Tp == null) continue;
        const row = new Array(M).fill(0);
        row[0] = sm(cumN, p) - nA;
        row[1] = sm(cumS, p) - sA;
        for (let g = 0; g < run.gapIdxs.length; g++) {
          row[2 + run.gapIdxs[g]] = -(sm(cumI[g], p) - iA[g]);
        }
        rows.push({ row, y: (sm(cumC, p) - cA) + KCAL_PER_LB * (Ta - Tp) });
      }
    }
    anyPoints = Math.max(anyPoints, rows.length);
    if (rows.length < ENERGY_FIT_MIN_POINTS) continue;

    const XtX = Array.from({ length: M }, () => new Array(M).fill(0));
    const Xty = new Array(M).fill(0);
    for (const { row, y } of rows) {
      for (let r = 0; r < M; r++) {
        if (row[r] === 0) continue;
        for (let c = r; c < M; c++) XtX[r][c] += row[r] * row[c];
        Xty[r] += row[r] * y;
      }
    }
    for (let r = 0; r < M; r++) for (let c = 0; c < r; c++) XtX[r][c] = XtX[c][r];

    const sol = solveLinearSystem(XtX, Xty);
    if (!sol) continue;

    let sse = 0;
    for (const { row, y } of rows) {
      let pred = 0;
      for (let c = 0; c < M; c++) pred += row[c] * sol[c];
      sse += (y - pred) * (y - pred);
    }
    const mse = sse / rows.length;
    const plausible = sol[1] >= 0.01 && sol[1] <= 0.1 && sol[0] >= 500 && sol[0] <= 5000;

    if (!best ||
        (plausible && !best.plausible) ||
        (plausible === best.plausible && mse < best.mse)) {
      best = { lag, sol, mse, points: rows.length, plausible };
    }
  }

  if (!best) {
    return { valid: false, reason: `only ${anyPoints} usable day(s) so far — needs ${ENERGY_FIT_MIN_POINTS}+`, points: anyPoints, stepSd, pendingGaps };
  }
  if (!best.plausible) {
    return { valid: false, reason: `fit result implausible (base ${Math.round(best.sol[0])}, ${best.sol[1].toFixed(3)}/step) — needs more or cleaner data`, points: best.points, stepSd, base: best.sol[0], perStep: best.sol[1], pendingGaps };
  }

  const solvedGaps = bridgedGaps.map((g, gi) => ({
    ...g,
    estTotal: best.sol[2 + gi],
    estPerDay: best.sol[2 + gi] / g.len
  }));

  return {
    valid: true,
    base: best.sol[0],
    perStep: best.sol[1],
    lag: best.lag,
    points: best.points,
    stepSd,
    avgSteps: mSt,
    solvedGaps,
    pendingGaps
  };
}

// Most recent day (on or before endISO) with calories logged, scored against
// the best available maintenance estimate (prefer the steadier 28-day one).
function latestEnergyBalance(entries, endISO, est28, est14) {
  const calByDay = dailyNumberMap(entries, "calories");
  const days = [...calByDay.keys()].filter(d => d <= endISO).sort();
  const dayISO = days.length ? days[days.length - 1] : null;

  const est =
    (est28.maintenance != null) ? { n: 28, v: est28.maintenance } :
    (est14.maintenance != null) ? { n: 14, v: est14.maintenance } : null;

  if (dayISO == null || est == null) return { dayISO, est, cal: null, balance: null, paceLbWk: null };

  const cal = calByDay.get(dayISO);
  const balance = cal - est.v;
  return { dayISO, est, cal, balance, paceLbWk: balance * 7 / KCAL_PER_LB };
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
  if (caloriesInput) caloriesInput.value = "";
  if (stepsInput) stepsInput.value = "";
  notesInput.value = "";
  dateInput.value = todayISO();
}

function startEdit(id) {
  const entries = loadEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  editingId = id;
  dateInput.value = entry.date;
  weightInput.value = (typeof entry.weight === "number") ? String(entry.weight) : "";
  if (caloriesInput) caloriesInput.value = (typeof entry.calories === "number") ? String(entry.calories) : "";
  if (stepsInput) stepsInput.value = (typeof entry.steps === "number") ? String(entry.steps) : "";
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

  // Resolve the Target day (T) within the plan week. Auto-follow the next
  // un-logged day unless the user pinned it; always clamp into [F, F+6].
  const fEndISO = dateToISO(addDays(isoToDate(fISO), 6));
  if (!tManual || tISO == null) tISO = nextUnloggedInWeek(entries, fISO);
  tISO = clampISO(tISO, fISO, fEndISO);

  // Populate the Target-day select with this week's 7 days (rebuild on window change).
  if (tSelect) {
    const weekDays = planWeekDays(fISO);
    if (tSelect.dataset.weekStart !== fISO) {
      tSelect.innerHTML = weekDays.map(iso => {
        const label = (iso === todayISO()) ? `${formatISO(iso)} (Today)` : formatISO(iso);
        return `<option value="${iso}">${label}</option>`;
      }).join("");
      tSelect.dataset.weekStart = fISO;
    }
    tSelect.value = tISO;
  }

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

  // --- Energy section (B-driven, like the MA cards) ---
  // Fit first: its solved untracked-day intakes feed the maintenance averages.
  const fit = fitEnergyModel(entries, todayISO());
  const gapEst = new Map();
  if (fit.valid && fit.solvedGaps) {
    for (const gSolved of fit.solvedGaps) {
      for (const iso of gSolved.dayISOs) gapEst.set(iso, Math.max(0, gSolved.estPerDay));
    }
  }

  const est14 = energyEstimate(entries, bISO, 14, gapEst);
  const est28 = energyEstimate(entries, bISO, 28, gapEst);

  const renderEstimate = (est, vEl, hEl) => {
    if (vEl) {
      vEl.textContent = (est.maintenance == null)
        ? "—"
        : `${Math.round(est.maintenance).toLocaleString()} kcal/day`;
    }
    if (hEl) {
      const N = est.windowDays;
      const parts = [`${formatRange(bISO, N)}.`];
      parts.push(`Calories ${est.calDays}/${N} logged${est.estDays ? ` + ${est.estDays} estimated` : ""}${est.avgIn != null ? ` (avg ${Math.round(est.avgIn).toLocaleString()})` : ""}.`);
      if (est.maintenance == null) {
        parts.push(`Needs calories on ${Math.ceil(N * ENERGY_MIN_CAL_COVERAGE)}+ days and ${ENERGY_MIN_MA_DAYS}+ weigh-ins near both ends of the window.`);
      } else {
        parts.push(`Trend ${formatDelta(est.trendDelta)} lb over the window.`);
      }
      if (est.avgSteps != null) {
        parts.push(`Steps avg ${Math.round(est.avgSteps).toLocaleString()} (${est.stepDays}/${N}).`);
      }
      hEl.textContent = parts.join(" ");
    }
  };
  renderEstimate(est14, tdee14El, tdee14HintEl);
  renderEstimate(est28, tdee28El, tdee28HintEl);

  const bal = latestEnergyBalance(entries, bISO, est28, est14);
  if (balanceEl) {
    balanceEl.textContent = (bal.balance == null)
      ? "—"
      : `${bal.balance > 0 ? "+" : ""}${Math.round(bal.balance).toLocaleString()} kcal`;
  }
  if (balanceHintEl) {
    if (bal.balance == null) {
      balanceHintEl.textContent =
        "Needs a day with calories logged and a valid maintenance estimate.";
    } else {
      balanceHintEl.textContent =
        `${formatISO(bal.dayISO)}: ate ${Math.round(bal.cal).toLocaleString()} vs ${bal.est.n}-day maintenance ${Math.round(bal.est.v).toLocaleString()}. ` +
        `≈ ${formatDelta(bal.paceLbWk)} lb/week if sustained.`;
    }
  }

  // Fitted burn model card (fit itself computed at the top of this block).
  if (energyFitEl) {
    energyFitEl.textContent = fit.valid
      ? `${Math.round(fit.base).toLocaleString()} + ${fit.perStep.toFixed(3)}/step`
      : "—";
  }
  if (energyFitHintEl) {
    const gapNotes = [];
    if (fit.solvedGaps && fit.solvedGaps.length) {
      gapNotes.push("Untracked day(s) solved from your weight response: " +
        fit.solvedGaps.map(gSolved =>
          `${formatISO(gSolved.startISO)}${gSolved.len > 1 ? `–${formatISO(gSolved.endISO)}` : ""} ≈ ${Math.round(Math.max(0, gSolved.estPerDay)).toLocaleString()}/day`
        ).join("; ") + " (rough values — their job is keeping the averages unbiased).");
    }
    if (fit.pendingGaps && fit.pendingGaps.length) {
      gapNotes.push("Pending: " +
        fit.pendingGaps.map(gPend =>
          `${formatISO(gPend.startISO)}${gPend.len > 1 ? `–${formatISO(gPend.endISO)}` : ""} (${gPend.reason})`
        ).join("; ") + ".");
    }

    if (fit.valid) {
      const atAvg = fit.base + fit.perStep * fit.avgSteps;
      energyFitHintEl.textContent =
        `Fitted from your last ${ENERGY_FIT_LOOKBACK} days (${fit.points} usable; daily-step spread ≈ ${Math.round(fit.stepSd).toLocaleString()}; scale response lag ≈ ${fit.lag} day(s), auto-detected). ` +
        `Base burn ≈ ${Math.round(fit.base).toLocaleString()} kcal/day plus ${fit.perStep.toFixed(3)} kcal per step ` +
        `— at your average ${Math.round(fit.avgSteps).toLocaleString()} steps that's ${Math.round(atAvg).toLocaleString()} total (cross-check against maintenance).` +
        (gapNotes.length ? " " + gapNotes.join(" ") : "");
    } else {
      energyFitHintEl.textContent =
        `No fit yet: ${fit.reason}. The calorie budget uses the manual kcal/step setting until the fit is possible.` +
        (gapNotes.length ? " " + gapNotes.join(" ") : "");
    }
  }

  // Plan header: the plan week (F → F+6) and today, for reference.
  if (planWindowRangeEl) {
    planWindowRangeEl.textContent = `Plan week ${formatISO(fISO)} → ${formatISO(fEndISO)}`;
  }
  if (planTodayEl) planTodayEl.textContent = formatISO(todayISO());

  // Direction word for the target ("or lower" for a cut, "or higher" for a gain).
  const dirWord = goalDelta7 < 0 ? "or lower" : (goalDelta7 > 0 ? "or higher" : "");

  // --- Top card: catch-up target weight for the selected Target day (T) ---
  const tgt = planCatchUpTarget(entries, fISO, tISO, goalDelta7);

  if (reqNext7TitleEl) reqNext7TitleEl.textContent = `Target weight for ${formatISO(tISO)}`;

  if (reqNext7AvgEl) {
    if (tgt.targetWeight == null) {
      reqNext7AvgEl.textContent = "—";
    } else {
      const num = round1(tgt.targetWeight).toFixed(1);
      reqNext7AvgEl.textContent = dirWord ? `${num} ${dirWord}` : num;
    }
  }

  if (reqNext7HintEl) {
    if (tgt.targetWeight == null) {
      reqNext7HintEl.textContent =
        `Needs a logged weight on the drop-off date (${formatISO(tgt.dropISO)}) to compute the target for ${formatISO(tISO)}.`;
    } else {
      let line = `Drop-off ${formatISO(tgt.dropISO)} was ${round1(tgt.dropWeight).toFixed(1)}. `;

      if (tgt.counted === 0) {
        // No prior days this week — the spread equals the plain on-pace target.
        line += `With a Δ7 goal of ${formatDelta(goalDelta7)}, the target for ${formatISO(tISO)} is ${round1(tgt.targetWeight).toFixed(1)}.`;
      } else {
        line +=
          `You've averaged ${formatDelta(tgt.currentPace)} lb/week over ${tgt.counted} day(s) (goal ${formatDelta(goalDelta7)}). ` +
          `Spread across the ${tgt.remaining} remaining day(s), each needs ${formatDelta(tgt.neededGap)} vs its drop-off ` +
          `to land the week on goal — for ${formatISO(tISO)} that's ${round1(tgt.targetWeight).toFixed(1)}. ` +
          `On-pace alone: ${round1(tgt.onPaceWeight).toFixed(1)}.`;
      }

      if (tgt.actualWeight != null) {
        line += ` Logged: ${round1(tgt.actualWeight).toFixed(1)} (${formatDelta(tgt.actualWeight - tgt.targetWeight)} vs target).`;
      }

      reqNext7HintEl.textContent = line;
    }
  }

  // --- Second card: current average pace so far this plan week ---
  // (each scored day = your weight minus the weight 7 days earlier, averaged).
  const wk = planWeekStatus(entries, fISO, goalDelta7);

  if (reqRemainingTitleEl) reqRemainingTitleEl.textContent = "Current pace";

  if (reqRemainingAvgEl) {
    reqRemainingAvgEl.textContent =
      (wk.currentPace == null) ? "—" : `${formatDelta(wk.currentPace)} lb/week`;
  }

  if (reqRemainingHintEl) {
    if (wk.currentPace == null) {
      reqRemainingHintEl.textContent =
        `No fully-scored days yet this week (needs a logged weight plus its drop-off 7 days earlier). ${wk.remaining} day(s) left.`;
    } else {
      reqRemainingHintEl.textContent =
        `Averaged over ${wk.scored}/7 day(s) scored vs their drop-off weights. ${wk.remaining} day(s) left. ${formatPaceStatus(wk.currentPace, goalDelta7)}`;
    }
  }

  // --- Third card: today's calorie budget ---
  // Burn for THIS day (maintenance, adjusted for today's steps vs the window
  // average) plus the plan's spread catch-up pace converted to calories.
  // Anchored to real today — eating is inherently a today decision.
  const estT28 = energyEstimate(entries, todayISO(), 28, gapEst);
  const estT14 = energyEstimate(entries, todayISO(), 14, gapEst);
  const estT =
    (estT28.maintenance != null) ? { n: 28, m: estT28.maintenance, avgSteps: estT28.avgSteps } :
    (estT14.maintenance != null) ? { n: 14, m: estT14.maintenance, avgSteps: estT14.avgSteps } : null;

  // Per-step cost: fitted from the user's own data when the fit is valid;
  // the manual setting is only the fallback. (fit computed in the Energy block)
  const kPerStep = fit.valid ? fit.perStep : stepKcal;
  const kSource = fit.valid ? `${fit.perStep.toFixed(3)} kcal/step fitted from your data` : `manual ${stepKcal} kcal/step (no fit: ${fit.reason})`;

  if (stepsTodayInput) {
    stepsTodayInput.placeholder = (estT && estT.avgSteps != null)
      ? `avg ${Math.round(estT.avgSteps).toLocaleString()}`
      : "e.g. 8000";
  }

  if (calBudgetEl && calBudgetHintEl) {
    if (!estT) {
      calBudgetEl.textContent = "—";
      calBudgetHintEl.textContent =
        "Needs a valid maintenance estimate first (see the Energy section for what's missing).";
    } else {
      const paceKcal = tgt.neededGap * KCAL_PER_LB / 7;

      let stepAdj = 0;
      let stepNote;
      if (estT.avgSteps == null) {
        stepNote = "No steps history in the window, so no step adjustment.";
      } else if (stepsToday == null) {
        stepNote = `Assuming your average steps (${Math.round(estT.avgSteps).toLocaleString()}) — type today's steps above to adjust.`;
      } else {
        stepAdj = (stepsToday - estT.avgSteps) * kPerStep;
        stepNote = `Steps: ${stepsToday.toLocaleString()} vs ${Math.round(estT.avgSteps).toLocaleString()} avg, at ${kSource}.`;
      }

      const budget = estT.m + stepAdj + paceKcal;
      calBudgetEl.textContent = `${Math.round(budget).toLocaleString()} kcal`;

      const sign = (x) => `${x < 0 ? "−" : "+"} ${Math.abs(Math.round(x)).toLocaleString()}`;
      calBudgetHintEl.textContent =
        `${estT.n}d maintenance ${Math.round(estT.m).toLocaleString()} ` +
        `${sign(paceKcal)} pace (${formatDelta(tgt.neededGap)} lb/wk)` +
        (stepAdj !== 0 ? ` ${sign(stepAdj)} steps` : "") +
        ` = ${Math.round(budget).toLocaleString()}. ${stepNote} Supports the ${formatISO(tISO)} target.`;
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
        const extras = [];
        if (typeof e.calories === "number") extras.push(`${Math.round(e.calories).toLocaleString()} cal`);
        if (typeof e.steps === "number") extras.push(`${Math.round(e.steps).toLocaleString()} steps`);
        row.innerHTML = `
          <div class="d">${formatISO(e.date)}</div>
          <div>
            <div class="w">${typeof e.weight === "number" ? round1(e.weight).toFixed(1) : "—"}</div>
            ${extras.length ? `<div class="n">${extras.join(" • ")}</div>` : ""}
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

// Calorie-budget inputs
if (stepsTodayInput) {
  stepsTodayInput.value = (stepsToday != null) ? String(stepsToday) : "";
  stepsTodayInput.addEventListener("input", () => {
    const raw = stepsTodayInput.value.trim();
    const v = raw === "" ? null : Number(raw);
    stepsToday = (v != null && Number.isFinite(v) && v >= 0) ? v : null;
    saveBudgetSteps(stepsToday);
    render();
  });
}
if (stepKcalInput) {
  stepKcalInput.value = String(stepKcal);
  stepKcalInput.addEventListener("input", () => {
    const v = Number(stepKcalInput.value.trim().replace(",", "."));
    stepKcal = (Number.isFinite(v) && v > 0 && v < 1) ? v : 0.04;
    saveStepKcal(stepKcal);
    render();
  });
}

// Plan (F) controls — moving the plan-week start resets the Target day to the
// new week's smart default (clean slate).
if (fPrevBtn) {
  fPrevBtn.addEventListener("click", () => {
    fISO = stepISO(fISO, -1);
    tManual = false;
    savePlanFrom(fISO);
    render();
  });
}
if (fNextBtn) {
  fNextBtn.addEventListener("click", () => {
    fISO = stepISO(fISO, +1);
    tManual = false;
    savePlanFrom(fISO);
    render();
  });
}
if (fSelect) {
  fSelect.addEventListener("change", () => {
    fISO = fSelect.value || todayISO();
    tManual = false;
    savePlanFrom(fISO);
    render();
  });
}

// Plan (T) controls — pick which day in the plan week to view; this pins the
// Target day until F is moved again.
function setTargetDay(iso) {
  const fEndISO = dateToISO(addDays(isoToDate(fISO), 6));
  tISO = clampISO(iso, fISO, fEndISO);
  tManual = true;
  render();
}
if (tPrevBtn) {
  tPrevBtn.addEventListener("click", () => setTargetDay(stepISO(tISO || fISO, -1)));
}
if (tNextBtn) {
  tNextBtn.addEventListener("click", () => setTargetDay(stepISO(tISO || fISO, +1)));
}
if (tSelect) {
  tSelect.addEventListener("change", () => setTargetDay(tSelect.value || fISO));
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

  // Empty field = not logged (never a zero). "0" typed in calories/steps is a
  // real value (e.g. a fasting day).
  const parseOptional = (inputEl) => {
    const raw = String(inputEl && inputEl.value != null ? inputEl.value : "").trim();
    return raw === "" ? null : Number(raw);
  };
  const w = parseOptional(weightInput);
  const cal = parseOptional(caloriesInput);
  const st = parseOptional(stepsInput);

  if (!date) return alert("Pick a date.");
  if (w != null && (!Number.isFinite(w) || w <= 0)) return alert("Enter a valid weight (> 0), or leave it blank.");
  if (cal != null && (!Number.isFinite(cal) || cal < 0)) return alert("Enter valid calories (0 or more), or leave it blank.");
  if (st != null && (!Number.isFinite(st) || st < 0)) return alert("Enter valid steps (0 or more), or leave it blank.");
  if (w == null && cal == null && st == null) return alert("Enter at least one of weight, calories, or steps.");

  const notes = (notesInput.value || "").trim();
  const entries = loadEntries();

  // undefined fields are dropped by JSON.stringify, so a cleared field is removed.
  const values = {
    date,
    weight: w == null ? undefined : w,
    calories: cal == null ? undefined : cal,
    steps: st == null ? undefined : st,
    notes
  };

  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx !== -1) {
      entries[idx] = { ...entries[idx], ...values };
    } else {
      entries.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
        ...values,
        createdAt: Date.now()
      });
    }
    exitEditMode();
  } else {
    entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      ...values,
      createdAt: Date.now()
    });

    weightInput.value = "";
    if (caloriesInput) caloriesInput.value = "";
    if (stepsInput) stepsInput.value = "";
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






