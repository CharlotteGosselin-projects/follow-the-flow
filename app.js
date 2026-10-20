'use strict';

// Follow the Flow: a cycle tracker that never sends anything over the network.
// All state lives in this browser's localStorage, optionally encrypted with a
// passphrase (AES-GCM, key derived with PBKDF2). There is no server.

const STORAGE_KEY = 'ftf:v1';
const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD = 5;
const LUTEAL_PHASE = 14;   // days from ovulation to next period (typical)
const HISTORY_WINDOW = 6;  // number of recent cycles used for averages
const DAY_MS = 86400000;
const EXPORT_EVERY = 7;      // days between backup reminders
const MOOD_MIN_SPAN = 60;    // ~2 months of mood history before forecasting
const MOOD_MIN_ENTRIES = 15; // ...with enough entries to be meaningful
const MOOD_LOOKBACK = 183;   // forecast uses at most the last ~6 months
const MOODS = [
  { id: 'happy', emoji: '😄', label: 'Happy' },
  { id: 'calm', emoji: '😌', label: 'Calm' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
  { id: 'sad', emoji: '😢', label: 'Sad' },
  { id: 'irritable', emoji: '😠', label: 'Irritable' },
  { id: 'anxious', emoji: '😰', label: 'Anxious' },
];
const MOOD_BY_ID = Object.fromEntries(MOODS.map(m => [m.id, m]));
// Sleep is logged on the morning after: the date is the day you woke up.
const SLEEP = [
  { id: 'poor', emoji: '🥱', label: 'Poor sleep' },
  { id: 'insomnia', emoji: '🦉', label: 'Insomnia' },
];
const SLEEP_BY_ID = Object.fromEntries(SLEEP.map(s => [s.id, s]));
const SLEEP_MIN_SPAN = 60;   // ~2 months of sleep tracking before showing patterns
const SLEEP_MIN_BAD = 3;     // ...with a few bad nights to compare
const PHASES = [
  { id: 'period', label: 'During your period', when: 'during your period' },
  { id: 'follicular', label: 'After your period', when: 'in the days after your period' },
  { id: 'ovulation', label: 'Around ovulation', when: 'around ovulation' },
  { id: 'luteal', label: 'Second half of cycle', when: 'in the second half of your cycle' },
  { id: 'premenstrual', label: 'Week before period', when: 'in the week before your period' },
];
// Habits are tapped once per day; habits with levels cycle through them on each tap.
const HABIT_GROUPS = [
  { id: 'daily', label: 'Daily habits' },
  { id: 'mind', label: 'Mind & social' },
  { id: 'body', label: 'Body' },
  { id: 'custom', label: 'Your own' },
];
const HABITS = [
  { id: 'exercise', emoji: '🏃', label: 'Exercise', group: 'daily', levels: ['light', 'intense'] },
  { id: 'caffeine', emoji: '☕', label: 'Caffeine', group: 'daily',
    levels: ['1 cup', '2 cups', '3 cups', '4 cups', '5+ cups'], heavy: { level: 3, label: '3+ cups' } },
  { id: 'alcohol', emoji: '🍷', label: 'Alcohol', group: 'daily',
    levels: ['1 drink', '2 drinks', '3 drinks', '4 drinks', '5+ drinks'], heavy: { level: 3, label: '3+ drinks' } },
  { id: 'stress', emoji: '😣', label: 'Stress', group: 'mind', levels: ['some', 'high'] },
  { id: 'meetings', emoji: '📅', label: 'Meetings', group: 'mind',
    levels: ['some', 'a lot', 'all day'], heavy: { level: 2, label: 'a lot or all day' } },
  { id: 'social', emoji: '👯', label: 'Social time', group: 'mind' },
  { id: 'alone', emoji: '🛋️', label: 'Alone time', group: 'mind' },
  { id: 'sick', emoji: '🤒', label: 'Sick', group: 'body' },
  { id: 'cramps', emoji: '😖', label: 'Cramps', group: 'body', levels: ['mild', 'strong'] },
  { id: 'headache', emoji: '🤕', label: 'Headache', group: 'body' },
  { id: 'digestion', emoji: '🤢', label: 'Digestion issues', group: 'body' },
];
const HABIT_MIN_SPAN = 60;   // ~2 months of habit logging before showing links
const HABIT_MIN_DAYS = 8;    // days with and without a habit needed to compare them
const HABIT_SHOW = 6;        // most findings listed per section
// Monthly recap: moods that make a day feel good or tough ('tired' is neither).
const GOOD_MOODS = ['happy', 'calm'];
const TOUGH_MOODS = ['sad', 'irritable', 'anxious'];
const RECAP_MIN_MOOD_DAYS = 3;  // mood days needed to describe a month
const RECAP_COMPARE_DAYS = 5;   // mood days needed in both months to compare them
// Charted in the recap, in this order, when there's something to show. `amount`:
// the levels are counts (drinks, cups), so totals add them up; otherwise totals count days.
const RECAP_CHARTS = [
  { habit: 'alcohol', amount: 'drink' },
  { habit: 'meetings' },
  { habit: 'caffeine', amount: 'cup' },
  { sleep: true },
  { habit: 'stress' },
  { habit: 'exercise' },
  { habit: 'sick' },
];
const RECAP_INSIGHTS = ['alcohol', 'meetings', 'caffeine', 'stress'];
const INSIGHT_MIN_DAYS = 4;     // days on each side before comparing moods or sleep
const SVG_NS = 'http://www.w3.org/2000/svg';

// days: sorted ISO dates ('YYYY-MM-DD') marked as period days
// moods: { 'YYYY-MM-DD': [moodId, ...] } (several moods per day allowed)
// sleep: { 'YYYY-MM-DD': 'poor' | 'insomnia' } (only bad nights are logged)
// habits: { 'YYYY-MM-DD': { habitId: level } } (level 1..n; {} = "none of these").
//   Only days present here count in the analysis, so forgotten days don't skew it.
// customHabits: [{ id, emoji, label, since }] habits added by the user
// hiddenHabits: [habitId] habits the user doesn't track
// chartPicks: [key | null] x3 lines shown on the recap chart, by colour slot (null = default)
// createdAt / lastExport / snoozeUntil: ISO dates driving the backup reminder
function emptyState() {
  return {
    days: [], moods: {}, sleep: {}, habits: {}, customHabits: [], hiddenHabits: [], chartPicks: null,
    createdAt: null, lastExport: null, snoozeUntil: null,
  };
}

let state = emptyState();
let cryptoKey = null;      // set when a passphrase protects the data
let salt = null;
let viewMonth = startOfMonth(todayIso());
let tapMode = 'period';    // what tapping a calendar day does: 'period' | 'mood'
let moodDialogDay = null;
let recapRange = 'month';  // what the recap charts cover: 'month' | 'year'

// ---------- dates (UTC math on ISO strings avoids DST/timezone drift) ----------

function todayIso() {
  const d = new Date();
  return toIso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
function toIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
function toMs(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(iso, n) { return toIso(toMs(iso) + n * DAY_MS); }
function diffDays(a, b) { return Math.round((toMs(b) - toMs(a)) / DAY_MS); }
function startOfMonth(iso) { return iso.slice(0, 8) + '01'; }
function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  return toIso(Date.UTC(y, m - 1 + n, 1));
}
function fmt(iso, opts = { day: 'numeric', month: 'short' }) {
  return new Date(toMs(iso)).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
}

// ---------- cycle analysis ----------

// Group marked days into periods. A one-day gap (e.g. forgot to log) still counts
// as the same period.
function periods(days) {
  const out = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && diffDays(last.end, d) <= 2) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

function average(nums, fallback) {
  if (!nums.length) return fallback;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function analyse() {
  const ps = periods(state.days);
  const cycles = [];
  for (let i = 1; i < ps.length; i++) cycles.push(diffDays(ps[i - 1].start, ps[i].start));
  // Ignore implausible gaps (missed logging, etc.) when averaging.
  const usable = cycles.filter(c => c >= 15 && c <= 60).slice(-HISTORY_WINDOW);
  const cycleLen = average(usable, DEFAULT_CYCLE);
  const periodLen = average(ps.slice(-HISTORY_WINDOW).map(p => diffDays(p.start, p.end) + 1), DEFAULT_PERIOD);
  const last = ps[ps.length - 1] || null;

  let nextStart = null;
  if (last) {
    nextStart = addDays(last.start, cycleLen);
    // If the predicted date is already past, roll forward so predictions stay useful.
    while (diffDays(nextStart, todayIso()) > cycleLen) nextStart = addDays(nextStart, cycleLen);
  }
  return { ps, cycles, cycleLen, periodLen, last, nextStart, sample: usable.length };
}

// Predicted markers for the next few cycles, computed from the last period start.
function predictions(a) {
  const predicted = new Set(), fertile = new Set(), ovulation = new Set();
  if (!a.last) return { predicted, fertile, ovulation };
  const marked = new Set(state.days);
  for (let k = 0; k <= 6; k++) {
    const start = addDays(a.last.start, a.cycleLen * k);
    if (k > 0) {
      for (let i = 0; i < a.periodLen; i++) {
        const d = addDays(start, i);
        if (!marked.has(d)) predicted.add(d);
      }
    }
    const ov = addDays(start, a.cycleLen - LUTEAL_PHASE);
    ovulation.add(ov);
    for (let i = -5; i <= 1; i++) fertile.add(addDays(ov, i));
  }
  return { predicted, fertile, ovulation };
}

// Cycle day (1-based) of a past date, relative to the latest period start on or before it.
function cycleDayOf(iso, ps) {
  let start = null;
  for (const p of ps) { if (p.start <= iso) start = p.start; else break; }
  return start ? diffDays(start, iso) + 1 : null;
}

// Mood forecast: for each upcoming day, look at the days logged on the same
// cycle day (±2 days, closer days weigh more) in past cycles and estimate how
// often each mood showed up. Since a day can have several moods, each mood gets
// its own likelihood. Only runs once there are ~2 months of mood history.
function moodForecast(a) {
  const today = todayIso();
  const entries = Object.entries(state.moods).filter(([d]) => d <= today).sort();
  const first = entries.length ? entries[0][0] : null;
  const span = first ? diffDays(first, today) + 1 : 0;
  const status = { span, count: entries.length, ready: false, days: [] };
  if (!a.last || span < MOOD_MIN_SPAN || entries.length < MOOD_MIN_ENTRIES) return status;

  const L = a.cycleLen;
  const samples = [];
  for (const [d, moods] of entries) {
    if (diffDays(d, today) > MOOD_LOOKBACK) continue;
    const cd = cycleDayOf(d, a.ps);
    if (cd) samples.push({ cd, moods });
  }
  if (samples.length < MOOD_MIN_ENTRIES) return status;
  status.ready = true;

  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const cd = futureCycleDay(d, a);
    const score = {};
    let total = 0;
    for (const s of samples) {
      const raw = Math.abs(s.cd - cd);
      const dist = Math.min(raw, Math.abs(L - raw)); // cycles wrap around
      if (dist > 2) continue;
      const w = 3 - dist;
      for (const m of s.moods) score[m] = (score[m] || 0) + w;
      total += w;
    }
    // Moods present on at least 40% of comparable days (top 3), or the single most likely one.
    const ranked = Object.entries(score)
      .map(([id, w]) => ({ id, pct: Math.round(100 * w / total) }))
      .sort((x, y) => y.pct - x.pct);
    const likely = ranked.filter(r => r.pct >= 40).slice(0, 3);
    status.days.push({
      date: d, cycleDay: cd,
      moods: total >= 3 ? (likely.length ? likely : ranked.slice(0, 1)) : [],
    });
  }
  return status;
}

// Which part of the cycle a cycle day falls in, using the average cycle and period length.
function phaseOf(cd, a) {
  const L = a.cycleLen, ov = L - LUTEAL_PHASE;
  if (cd <= a.periodLen) return 'period';
  if (cd > L - 7) return 'premenstrual'; // also covers days past a late period
  if (Math.abs(cd - ov) <= 2) return 'ovulation';
  return cd < ov ? 'follicular' : 'luteal';
}

// Predicted cycle day for a date on or after the last period start.
function futureCycleDay(d, a) {
  const L = a.cycleLen;
  return ((diffDays(a.last.start, d) % L) + L) % L + 1;
}

// Sleep pattern: for each phase, the share of tracked nights that were bad.
// Tracking starts at the first logged bad night; unlogged nights count as normal.
function sleepPattern(a) {
  const today = todayIso();
  const logged = Object.keys(state.sleep).filter(d => d <= today).sort();
  const first = logged[0] || null;
  const span = first ? diffDays(first, today) + 1 : 0;
  const status = { span, bad: logged.length, ready: false, phases: [], top: null };
  if (!a.last || span < SLEEP_MIN_SPAN || logged.length < SLEEP_MIN_BAD) return status;

  const nights = {}, bad = {};
  let total = 0, totalBad = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const cd = cycleDayOf(d, a.ps);
    if (!cd) continue;
    const ph = phaseOf(cd, a);
    nights[ph] = (nights[ph] || 0) + 1;
    total++;
    if (state.sleep[d]) { bad[ph] = (bad[ph] || 0) + 1; totalBad++; }
  }
  if (!totalBad) return status;
  status.ready = true;
  status.phases = PHASES.filter(p => nights[p.id]).map(p => ({
    ...p, nights: nights[p.id], bad: bad[p.id] || 0, rate: (bad[p.id] || 0) / nights[p.id],
  }));
  const overall = totalBad / total;
  const best = [...status.phases].sort((x, y) => y.rate - x.rate)[0];
  // Only call out a phase when it clearly stands out from the rest of the cycle.
  if (best && best.rate >= 1.5 * overall && best.bad >= 2) status.top = best;
  return status;
}

// ---------- habits ----------

function allHabits() {
  return [...HABITS, ...state.customHabits.map(c => ({ ...c, group: 'custom' }))];
}

function activeHabits() {
  return allHabits().filter(h => !state.hiddenHabits.includes(h.id));
}

// What the analysis compares: each habit at any level, and levelled habits
// also at a high level: their `heavy` threshold (e.g. 3+ cups of coffee, so
// there are enough days to compare) or else their top level.
function habitFactors() {
  const out = [];
  for (const h of activeHabits()) {
    out.push({ label: `${h.emoji} ${h.label}`, since: h.since, top: false, has: d => !!state.habits[d][h.id] });
    if (h.levels) {
      const top = h.heavy ? h.heavy.level : h.levels.length;
      const topLabel = h.heavy ? h.heavy.label : h.levels[top - 1];
      out.push({ label: `${h.emoji} ${h.label} (${topLabel})`, since: h.since, top: true,
        has: d => (state.habits[d][h.id] || 0) >= top });
    }
  }
  return out;
}

// How often `outcome` happens on days with a factor, compared with what days
// without it in the same cycle phases would predict. Comparing within phases
// keeps a habit that simply clusters in one phase (say, coffee in the week
// before a period) from being blamed for that phase's effect.
function compareByPhase(samples, has, outcome) {
  const by = {};
  for (const s of samples) {
    const g = by[s.phase] || (by[s.phase] = { w: 0, wHit: 0, o: 0, oHit: 0 });
    const hit = outcome(s.day);
    if (has(s.day)) { g.w++; if (hit) g.wHit++; } else { g.o++; if (hit) g.oHit++; }
  }
  let n = 0, hits = 0, expected = 0, others = 0;
  for (const g of Object.values(by)) {
    if (!g.w || !g.o) continue; // no comparison possible in this phase
    n += g.w; hits += g.wHit; others += g.o;
    expected += g.w * g.oHit / g.o;
  }
  if (n < HABIT_MIN_DAYS || others < HABIT_MIN_DAYS) return null;
  return { n, observed: hits / n, expected: expected / n };
}

// Only clear differences are worth showing.
function notable(r) {
  if (!r) return false;
  return Math.abs(r.observed - r.expected) >= 0.15 &&
    (r.observed >= 1.5 * r.expected || r.observed <= r.expected / 1.5);
}

// The phase where a factor is clearly most common, if any.
function phaseSpread(samples, has) {
  const days = {}, hits = {};
  let n = 0;
  for (const s of samples) {
    days[s.phase] = (days[s.phase] || 0) + 1;
    if (has(s.day)) { hits[s.phase] = (hits[s.phase] || 0) + 1; n++; }
  }
  if (n < HABIT_MIN_DAYS) return null;
  const overall = n / samples.length;
  const best = PHASES.filter(p => days[p.id] >= 5)
    .map(p => ({ phase: p, count: hits[p.id] || 0, rate: (hits[p.id] || 0) / days[p.id] }))
    .sort((x, y) => y.rate - x.rate)[0];
  if (!best || best.count < 3 || best.rate < 1.5 * overall) return null;
  return { phase: best.phase, rate: best.rate, overall };
}

// Links between habits and sleep, mood and cycle phase. Uses only days where
// habits were logged, and starts after ~2 months of logging.
function habitInsights(a) {
  const today = todayIso();
  const logged = Object.keys(state.habits).filter(d => d <= today).sort();
  const span = logged.length ? diffDays(logged[0], today) + 1 : 0;
  const status = { span, count: logged.length, ready: false, sleep: [], mood: [], cycle: [] };
  if (!a.last || span < HABIT_MIN_SPAN) return status;
  status.ready = true;

  const samples = [];
  for (const d of logged) {
    const cd = cycleDayOf(d, a.ps);
    if (cd) samples.push({ day: d, phase: phaseOf(cd, a) });
  }
  // A day's habits go with the night after it. Sleep is logged on the morning
  // after, from the first bad night logged; unlogged nights count as normal.
  const firstSleep = Object.keys(state.sleep).sort()[0];
  const sleepSamples = firstSleep
    ? samples.filter(s => { const n = addDays(s.day, 1); return n >= firstSleep && n < today; })
    : [];
  const badNight = d => !!state.sleep[addDays(d, 1)];
  const moodSamples = samples.filter(s => state.moods[s.day]);

  for (const f of habitFactors()) {
    // A habit added later only counts from the day it was added.
    const own = list => (f.since ? list.filter(s => s.day >= f.since) : list);
    const r = compareByPhase(own(sleepSamples), f.has, badNight);
    if (notable(r)) status.sleep.push({ f, ...r });
    for (const m of MOODS) {
      const rm = compareByPhase(own(moodSamples), f.has, d => state.moods[d].includes(m.id));
      if (notable(rm)) status.mood.push({ f, mood: m, ...rm });
    }
    if (!f.top) {
      const c = phaseSpread(own(samples), f.has);
      if (c) status.cycle.push({ f, ...c });
    }
  }
  const gap = r => Math.abs(r.observed - r.expected);
  status.sleep.sort((x, y) => gap(y) - gap(x));
  status.mood.sort((x, y) => gap(y) - gap(x));
  status.cycle.sort((x, y) => y.rate / y.overall - x.rate / x.overall);
  return status;
}

// ---------- monthly recap ----------

// The phase most of `days` fall in, if one clearly dominates (at least half of them).
function mainPhase(days, a) {
  if (!a.last || days.length < 2) return null;
  const count = {};
  for (const d of days) {
    const cd = cycleDayOf(d, a.ps);
    if (cd) { const ph = phaseOf(cd, a); count[ph] = (count[ph] || 0) + 1; }
  }
  const best = PHASES.map(p => ({ p, n: count[p.id] || 0 })).sort((x, y) => y.n - x.n)[0];
  return best.n >= 2 && best.n >= days.length / 2 ? best.p : null;
}

// Everything logged in one calendar month, up to today.
function monthStats(month, a) {
  const today = todayIso();
  const end = addDays(addMonths(month, 1), -1);
  const last = end < today ? end : today;
  const days = [];
  for (let d = month; d <= last; d = addDays(d, 1)) days.push(d);
  const inMonth = d => d >= month && d <= last;

  const moodDays = days.filter(d => state.moods[d]);
  const moodCount = {};
  for (const d of moodDays) for (const m of state.moods[d]) moodCount[m] = (moodCount[m] || 0) + 1;
  const has = (d, ids) => state.moods[d].some(m => ids.includes(m));
  const good = moodDays.filter(d => has(d, GOOD_MOODS) && !has(d, TOUGH_MOODS));
  const tough = moodDays.filter(d => has(d, TOUGH_MOODS) && !has(d, GOOD_MOODS));

  // Sleep tracking starts at the first bad night ever logged; unlogged nights count as normal.
  const firstSleep = Object.keys(state.sleep).sort()[0];
  const sleepNights = firstSleep ? days.filter(d => d >= firstSleep).length : 0;
  const bad = days.filter(d => state.sleep[d]);

  // Sick days count only once habit logging has started, so the comparison is fair.
  const firstHabit = Object.keys(state.habits).sort()[0];
  const habitDays = days.filter(d => state.habits[d]);
  const habitCount = {};
  for (const d of habitDays) for (const id of Object.keys(state.habits[d])) habitCount[id] = (habitCount[id] || 0) + 1;

  return {
    month, days: days.length, complete: end < today,
    moodDays, moodCount, good, tough,
    sleepNights, bad, insomnia: bad.filter(d => state.sleep[d] === 'insomnia').length,
    habitTracked: firstHabit ? days.filter(d => d >= firstHabit).length : 0,
    habitDays: habitDays.length, habitCount,
    periods: a.ps.map((p, i) => ({ ...p, i })).filter(p => inMonth(p.start)),
  };
}

// 'good' | 'mixed' | 'tough', from the balance of good and tough mood days.
function monthTone(s) {
  if (s.moodDays.length < RECAP_MIN_MOOD_DAYS) return null;
  const balance = (s.good.length - s.tough.length) / s.moodDays.length;
  return balance >= 0.3 ? 'good' : balance <= -0.3 ? 'tough' : 'mixed';
}

// How a period start compared with what its own past cycles predicted.
function periodRecap(p, a) {
  const length = diffDays(p.start, p.end) + 1;
  const ongoing = p.end >= addDays(todayIso(), -1) && p.i === a.ps.length - 1;
  const out = { start: p.start, length, ongoing, cycle: null, avg: null, shift: null };
  if (p.i > 0) {
    out.cycle = diffDays(a.ps[p.i - 1].start, p.start);
    const before = a.cycles.slice(0, p.i - 1).filter(c => c >= 15 && c <= 60).slice(-HISTORY_WINDOW);
    if (before.length && out.cycle >= 15 && out.cycle <= 60) {
      out.avg = average(before, DEFAULT_CYCLE);
      out.shift = out.cycle - out.avg; // > 0: late, < 0: early
    }
  }
  return out;
}

// Short lines comparing a month with the one before it.
function compareMonths(s, prev) {
  const lines = [];
  const name = fmt(prev.month, { month: 'long' });
  const soFar = s.complete ? '' : ' so far';
  if (s.moodDays.length >= RECAP_COMPARE_DAYS && prev.moodDays.length >= RECAP_COMPARE_DAYS) {
    const share = (st, id) => (st.moodCount[id] || 0) / st.moodDays.length;
    const changes = MOODS.map(m => ({ m, now: share(s, m.id), before: share(prev, m.id) }))
      .filter(c => Math.abs(c.now - c.before) >= 0.15)
      .sort((x, y) => Math.abs(y.now - y.before) - Math.abs(x.now - x.before))
      .slice(0, 2);
    for (const c of changes) {
      lines.push(`${c.m.emoji} ${c.now > c.before ? 'More' : 'Fewer'} ${c.m.label.toLowerCase()} days than in ${name}${soFar} ` +
        `(${Math.round(100 * c.now)}% of logged days vs ${Math.round(100 * c.before)}%).`);
    }
  }
  // Rates per night, so a month that is still going compares fairly.
  if (s.sleepNights >= 7 && prev.sleepNights >= 7) {
    const now = s.bad.length / s.sleepNights, before = prev.bad.length / prev.sleepNights;
    if (Math.abs(now - before) >= 0.1) {
      lines.push(`${now < before ? '😴 Slept better' : '🦉 Slept worse'} than in ${name}${soFar} ` +
        `(${plural(s.bad.length, 'bad night')} in ${s.sleepNights} vs ${prev.bad.length} in ${prev.sleepNights}).`);
    }
  }
  if (s.habitTracked >= 7 && prev.habitTracked >= 7) {
    const now = s.habitCount.sick || 0, before = prev.habitCount.sick || 0;
    if (now !== before && (now >= 2 || before >= 2)) {
      lines.push(`🤒 ${now > before ? 'More' : 'Fewer'} sick days than in ${name}${soFar} (${now} vs ${before}).`);
    }
  }
  return lines;
}

// ---------- recap charts & insights ----------

// The days a recap chart covers: the shown month day by day, or its year month by month.
function rangeDays(range) {
  return range === 'year' ? daysBetween(viewMonth.slice(0, 5) + '01-01', 12) : daysBetween(viewMonth, 1);
}

// Every date in the `months` calendar months starting at `from` (a 1st of the month).
function daysBetween(from, months) {
  const out = [];
  for (let d = from, to = addMonths(from, months); d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

// One chart's daily values: a number for a logged day (0 = logged, not this habit),
// null for a day with nothing logged.
function chartSeries(c) {
  const today = todayIso();
  if (c.sleep) {
    const first = Object.keys(state.sleep).sort()[0];
    return {
      key: 'sleep', emoji: '🌙', title: 'Bad nights', levels: ['poor sleep', 'insomnia'], amount: null,
      value: d => (first && d >= first && d <= today ? (state.sleep[d] === 'insomnia' ? 2 : state.sleep[d] ? 1 : 0) : null),
      total: n => plural(n, 'bad night'),
    };
  }
  const h = allHabits().find(x => x.id === c.habit);
  if (!h || state.hiddenHabits.includes(h.id)) return null;
  return {
    key: h.id, emoji: h.emoji, title: h.label, levels: h.levels || ['yes'], amount: c.amount || null, heavy: h.heavy,
    value: d => (state.habits[d] && d <= today ? state.habits[d][h.id] || 0 : null),
    total: n => plural(n, c.amount || 'day'),
  };
}

// Text for one day's value, e.g. '2 drinks', 'a lot', 'none', 'not logged'.
function levelText(c, v) {
  if (v == null) return 'not logged';
  if (!v) return 'none';
  return c.key === 'sick' ? 'sick' : c.levels[v - 1];
}

// Days and totals for a set of dates. Amount habits add up their counts (5+ counts as 5).
function chartTotals(c, days) {
  let logged = 0, hit = 0, sum = 0, heavy = 0;
  for (const d of days) {
    const v = c.value(d);
    if (v == null) continue;
    logged++;
    if (v) { hit++; sum += v; if (c.heavy && v >= c.heavy.level) heavy++; }
  }
  return { logged, hit, sum: c.amount ? sum : hit, heavy };
}

function shortList(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Plain-language findings for the charted range. Simple counts over this range, so they
// describe what happened rather than prove a cause.
function recapInsights(range, a) {
  const today = todayIso();
  const days = rangeDays(range).filter(d => d <= today);
  const out = [];
  for (const id of RECAP_INSIGHTS) {
    const c = chartSeries({ habit: id, amount: RECAP_CHARTS.find(x => x.habit === id).amount });
    if (!c) continue;
    const logged = days.filter(d => c.value(d) != null);
    const hitDays = logged.filter(d => c.value(d) > 0);
    if (!hitDays.length) continue;
    const name = c.title.toLowerCase();

    // Compared with the months before (month view only).
    if (range === 'month' && logged.length >= 7) {
      const past = [];
      for (let k = 1; k <= 6; k++) {
        const t = chartTotals(c, daysBetween(addMonths(viewMonth, -k), 1));
        if (t.logged >= 10) past.push(t.hit / t.logged);
      }
      if (past.length >= 2) {
        const usual = past.reduce((x, y) => x + y, 0) / past.length;
        const now = hitDays.length / logged.length;
        if (Math.abs(now - usual) >= 0.1 && (now >= 1.5 * usual || now <= usual / 1.5)) {
          out.push(`${c.emoji} ${now > usual ? 'More' : 'Less'} ${name} than usual: ${Math.round(100 * now)}% of logged days vs ${Math.round(100 * usual)}% in your previous months.`);
        }
      }
    }
    // Heavy days (3+ drinks, 3+ cups, a lot of meetings).
    if (c.heavy) {
      const heavy = hitDays.filter(d => c.value(d) >= c.heavy.level).length;
      if (heavy) out.push(`${c.emoji} ${plural(heavy, 'day')} with ${c.amount ? c.heavy.label : `${name} ${c.heavy.label}`}.`);
    }
    // Days of the week.
    if (hitDays.length >= 5) {
      const byDay = Array(7).fill(0);
      for (const d of hitDays) byDay[(new Date(toMs(d)).getUTCDay() + 6) % 7]++;
      const top = byDay.map((n, i) => ({ n, i })).sort((x, y) => y.n - x.n);
      const share = (top[0].n + top[1].n) / hitDays.length;
      if (share >= 0.6) {
        const names = top.slice(0, 2).sort((x, y) => x.i - y.i).map(t => fmt(addDays('2024-01-01', t.i), { weekday: 'long' }) + 's');
        out.push(`${c.emoji} ${c.title} mostly on ${shortList(names)} (${Math.round(100 * share)}% of ${plural(hitDays.length, 'day')}).`);
      }
    }
    // Part of the cycle.
    const ph = hitDays.length >= INSIGHT_MIN_DAYS && mainPhase(hitDays, a);
    if (ph && hitDays.length >= 6) out.push(`${c.emoji} ${c.title} days were mostly ${ph.when}.`);

    // Mood the same day and sleep the night after, with vs without (or heavy vs not).
    const isHit = c.heavy ? d => c.value(d) >= c.heavy.level : d => c.value(d) > 0;
    const what = c.heavy ? `days with ${c.amount ? c.heavy.label : `${name} ${c.heavy.label}`}` : `${name} days`;
    const moodDays = logged.filter(d => state.moods[d]);
    const tough = d => state.moods[d].some(m => TOUGH_MOODS.includes(m));
    const mw = moodDays.filter(isHit), mo = moodDays.filter(d => !isHit(d));
    if (mw.length >= INSIGHT_MIN_DAYS && mo.length >= INSIGHT_MIN_DAYS) {
      const x = mw.filter(tough).length / mw.length, y = mo.filter(tough).length / mo.length;
      if (Math.abs(x - y) >= 0.25) {
        out.push(`${c.emoji} Tough moods on ${Math.round(100 * x)}% of ${what} vs ${Math.round(100 * y)}% of other days.`);
      }
    }
    const firstSleep = Object.keys(state.sleep).sort()[0];
    const nights = firstSleep ? logged.filter(d => addDays(d, 1) >= firstSleep && addDays(d, 1) <= today) : [];
    const sw = nights.filter(isHit), so = nights.filter(d => !isHit(d));
    if (sw.length >= INSIGHT_MIN_DAYS && so.length >= INSIGHT_MIN_DAYS) {
      const bad = d => !!state.sleep[addDays(d, 1)];
      const x = sw.filter(bad).length / sw.length, y = so.filter(bad).length / so.length;
      if (Math.abs(x - y) >= 0.2) {
        out.push(`${c.emoji} A bad night after ${Math.round(100 * x)}% of ${what} vs ${Math.round(100 * y)}% of other days.`);
      }
    }
  }
  return out;
}

// ---------- persistence ----------

async function save() {
  if (!state.createdAt) state.createdAt = todayIso();
  let payload;
  if (cryptoKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(state));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
    payload = { enc: true, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  } else {
    payload = { enc: false, data: state };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadRaw() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

async function deriveKey(pass, saltBytes) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function decrypt(raw, pass) {
  const s = unb64(raw.salt);
  const key = await deriveKey(pass, s);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(raw.iv) }, key, unb64(raw.ct));
  return { key, salt: s, data: JSON.parse(new TextDecoder().decode(pt)) };
}

function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

function isIsoDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(toMs(d)); }

function sanitize(data) {
  data = data || {};
  const days = Array.isArray(data.days) ? data.days.filter(isIsoDate) : [];
  const moods = {};
  if (data.moods && typeof data.moods === 'object') {
    for (const [d, v] of Object.entries(data.moods)) {
      // Older versions stored a single mood id per day.
      const ids = (Array.isArray(v) ? v : [v]).filter(m => MOOD_BY_ID[m]);
      const unique = MOODS.map(m => m.id).filter(id => ids.includes(id));
      if (isIsoDate(d) && unique.length) moods[d] = unique;
    }
  }
  const sleep = {};
  if (data.sleep && typeof data.sleep === 'object') {
    for (const [d, v] of Object.entries(data.sleep)) if (isIsoDate(d) && SLEEP_BY_ID[v]) sleep[d] = v;
  }
  const date = v => (isIsoDate(v) ? v : null);
  const customHabits = [];
  if (Array.isArray(data.customHabits)) {
    for (const c of data.customHabits) {
      if (!c || typeof c.id !== 'string' || !/^c[a-z0-9]{1,16}$/.test(c.id)) continue;
      const label = typeof c.label === 'string' ? c.label.trim().slice(0, 30) : '';
      if (label && !customHabits.some(x => x.id === c.id)) {
        customHabits.push({ id: c.id, emoji: firstGrapheme(c.emoji) || '⭐', label, since: date(c.since) });
      }
    }
  }
  const maxLevel = new Map([...HABITS, ...customHabits].map(h => [h.id, h.levels ? h.levels.length : 1]));
  const habits = {};
  if (data.habits && typeof data.habits === 'object') {
    for (const [d, v] of Object.entries(data.habits)) {
      if (!isIsoDate(d) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const day = {};
      for (const [id, lv] of Object.entries(v)) {
        if (Number.isInteger(lv) && lv >= 1 && lv <= (maxLevel.get(id) || 0)) day[id] = lv;
      }
      // An empty day means "none of these"; a day whose entries were all invalid is dropped.
      if (Object.keys(day).length || !Object.keys(v).length) habits[d] = day;
    }
  }
  const hiddenHabits = Array.isArray(data.hiddenHabits) ? [...new Set(data.hiddenHabits.filter(id => maxLevel.has(id)))] : [];
  const chartKeys = new Set(RECAP_CHARTS.map(c => c.habit || 'sleep'));
  const chartPicks = Array.isArray(data.chartPicks) && data.chartPicks.length === 3
    ? data.chartPicks.map(k => (chartKeys.has(k) ? k : null)).map((k, i, all) => (all.indexOf(k) === i ? k : null))
    : null;
  return {
    days: [...new Set(days)].sort(), moods, sleep, habits, customHabits, hiddenHabits, chartPicks,
    createdAt: date(data.createdAt), lastExport: date(data.lastExport), snoozeUntil: date(data.snoozeUntil),
  };
}

// First user-visible character (keeps multi-part emoji like 👩‍💻 whole).
function firstGrapheme(s) {
  s = typeof s === 'string' ? s.trim() : '';
  if (!s) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return new Intl.Segmenter().segment(s)[Symbol.iterator]().next().value.segment.slice(0, 16);
  return [...s][0];
}

// ---------- rendering ----------

const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  const a = analyse();
  // Each card renders on its own, so a problem in one never leaves the others empty.
  for (const part of [renderReminder, renderSummary, renderMood, renderSleep, renderHabits,
    renderCalendar, renderMonthRecap, renderHistory]) {
    try { part(a); } catch (e) { console.error(e); }
  }
  const locked = !!cryptoKey;
  $('set-pass').textContent = locked ? 'Change passphrase' : 'Set passphrase';
  $('remove-pass').hidden = !locked;
  $('lock-now').hidden = !locked;
}

function renderSummary(a) {
  const box = $('summary');
  box.replaceChildren();
  const today = todayIso();

  if (!a.last) {
    box.append(el('h2', null, 'Welcome'),
      el('p', null, 'Tap the days of your last period on the calendar below to start. Predictions improve as you log more cycles.'));
    return;
  }

  const cycleDay = diffDays(a.last.start, today) + 1;
  const toNext = diffDays(today, a.nextStart);
  const inPeriod = state.days.includes(today);

  const big = el('div', 'big');
  if (inPeriod) big.textContent = `Period · day ${cycleDay}`;
  else if (toNext > 0) big.textContent = `${toNext} day${toNext === 1 ? '' : 's'} until next period`;
  else if (toNext === 0) big.textContent = 'Period expected today';
  else big.textContent = `Period ${-toNext} day${toNext === -1 ? '' : 's'} late`;

  const stats = el('dl', 'stats');
  const add = (k, v) => stats.append(el('dt', null, k), el('dd', null, v));
  add('Cycle day', String(cycleDay));
  add('Next period', fmt(a.nextStart, { weekday: 'short', day: 'numeric', month: 'short' }));
  add('Avg. cycle', `${a.cycleLen} days`);
  add('Avg. period', `${a.periodLen} days`);

  const note = el('p', 'muted small', a.sample
    ? `Based on your last ${a.sample} cycle${a.sample === 1 ? '' : 's'}.`
    : `Using a default ${DEFAULT_CYCLE}-day cycle until you log a second period.`);

  const btn = el('button', 'primary', inPeriod ? 'Unmark today' : 'Period started today');
  btn.addEventListener('click', () => toggleDay(today));

  box.append(big, stats, note, btn);
}

function hasData() {
  return state.days.length > 0 || Object.keys(state.moods).length > 0 || Object.keys(state.sleep).length > 0 ||
    Object.keys(state.habits).length > 0;
}

function renderReminder() {
  const today = todayIso();
  const ref = state.lastExport || state.createdAt;
  const due = hasData() && ref && diffDays(ref, today) >= EXPORT_EVERY &&
    !(state.snoozeUntil && today < state.snoozeUntil);
  $('reminder').hidden = !due;
  if (due) {
    $('reminder-text').textContent = state.lastExport
      ? `Your last export was ${diffDays(state.lastExport, today)} days ago (${fmt(state.lastExport)}).`
      : "You haven't exported a backup yet.";
  }
}

function moodButtons(container, d) {
  container.replaceChildren();
  const selected = state.moods[d] || [];
  for (const m of MOODS) {
    const b = el('button', null, `${m.emoji} ${m.label}`);
    b.type = 'button';
    b.value = m.id;
    b.setAttribute('aria-pressed', String(selected.includes(m.id)));
    b.addEventListener('click', () => toggleMood(d, m.id));
    container.append(b);
  }
}

function renderMood(a) {
  const today = todayIso();
  moodButtons($('mood-today'), today);

  const box = $('forecast');
  box.replaceChildren();
  const f = moodForecast(a);
  if (!f.ready) {
    const pct = Math.min(100, Math.round(100 * Math.min(f.span / MOOD_MIN_SPAN, f.count / MOOD_MIN_ENTRIES)));
    const bar = el('div', 'progress');
    const fill = el('span');
    fill.style.width = pct + '%';
    bar.append(fill);
    const needs = [];
    if (f.span < MOOD_MIN_SPAN) needs.push(`${MOOD_MIN_SPAN - f.span} more days of history`);
    if (f.count < MOOD_MIN_ENTRIES) needs.push(`${MOOD_MIN_ENTRIES - f.count} more mood entries`);
    if (!a.last) needs.push('at least one logged period');
    box.append(
      el('p', 'muted small', 'Pick as many moods as fit. Your mood forecast unlocks after about 2 months of mood logging, so it can learn how you usually feel at each point of your cycle.'),
      bar,
      el('p', 'muted small', needs.length ? `Still needed: ${needs.join(', ')}.` : 'Almost there. Keep logging moods after your periods.'));
    return;
  }
  const list = el('ul', 'forecast');
  f.days.forEach((d, i) => {
    const li = el('li');
    const ms = d.moods.map(r => ({ ...MOOD_BY_ID[r.id], pct: r.pct }));
    li.append(
      el('span', 'day', i === 0 ? 'Today' : fmt(d.date, { weekday: 'short', day: 'numeric' })),
      el('span', 'labels', ms.length ? '' : 'Not enough data'),
      el('span', 'conf', `day ${d.cycleDay}`));
    for (const m of ms) li.querySelector('.labels').append(el('span', 'likely', `${m.emoji} ${m.label} ${m.pct}%`));
    list.append(li);
  });
  box.append(list, el('p', 'muted small', 'Percentages show how often you felt each mood on the same days of past cycles. Just a pattern, not a certainty.'));
}

function sleepButtons(container, d) {
  container.replaceChildren();
  for (const s of SLEEP) {
    const b = el('button', null, `${s.emoji} ${s.label}`);
    b.type = 'button';
    b.value = s.id;
    b.setAttribute('aria-pressed', String(state.sleep[d] === s.id));
    b.addEventListener('click', () => setSleep(d, state.sleep[d] === s.id ? null : s.id));
    container.append(b);
  }
}

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

function renderSleep(a) {
  const today = todayIso();
  sleepButtons($('sleep-today'), today);

  const box = $('sleep-stats');
  box.replaceChildren();
  const recent = Object.entries(state.sleep).filter(([d]) => d <= today && diffDays(d, today) < 30);
  const insomnia = recent.filter(([, v]) => v === 'insomnia').length;
  const poor = recent.length - insomnia;
  box.append(el('h3', null, 'Last 30 days'),
    el('p', null, recent.length
      ? `${plural(insomnia, 'night')} of insomnia · ${plural(poor, 'poor night')}`
      : 'No bad nights logged.'));

  box.append(el('h3', null, 'Across your cycle'));
  const f = sleepPattern(a);
  if (!f.ready) {
    const needs = [];
    if (f.span < SLEEP_MIN_SPAN) needs.push(`${SLEEP_MIN_SPAN - f.span} more days of tracking`);
    if (f.bad < SLEEP_MIN_BAD) needs.push(`${SLEEP_MIN_BAD - f.bad} more bad nights logged`);
    if (!a.last) needs.push('at least one logged period');
    const bar = el('div', 'progress');
    const fill = el('span');
    fill.style.width = Math.min(100, Math.round(100 * f.span / SLEEP_MIN_SPAN)) + '%';
    bar.append(fill);
    box.append(
      el('p', 'muted small', 'After about 2 months of tracking, this shows when in your cycle bad nights tend to happen.'),
      bar,
      el('p', 'muted small', needs.length ? `Still needed: ${needs.join(', ')}.` : 'Almost there.'));
    return;
  }

  const max = Math.max(...f.phases.map(p => p.rate)) || 1;
  const list = el('ul', 'phases');
  list.setAttribute('aria-label', 'Share of nights with poor sleep or insomnia, by cycle phase');
  for (const p of f.phases) {
    const li = el('li', f.top && f.top.id === p.id ? 'top' : null);
    li.title = `${p.label}: ${p.bad} bad of ${plural(p.nights, 'night')}`;
    const track = el('span', 'track');
    const fill = el('span', 'fill');
    fill.style.width = (100 * p.rate / max) + '%';
    track.append(fill);
    li.append(el('span', 'name', p.label), track, el('span', 'value', `${Math.round(100 * p.rate)}%`));
    list.append(li);
  }
  box.append(list);

  if (f.top) {
    let note = `Bad nights are most common for you ${f.top.when}.`;
    // Heads-up if that phase is coming up in the next week.
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      if (phaseOf(futureCycleDay(d, a), a) === f.top.id) {
        note += i === 0 ? " You're in that phase now." : ` That phase starts around ${fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}.`;
        break;
      }
    }
    box.append(el('p', null, note));
  } else {
    box.append(el('p', 'muted small', "Your bad nights don't seem tied to one part of your cycle."));
  }
  box.append(el('p', 'muted small', 'Percentages show the share of nights in each phase with poor sleep or insomnia.'));
}

function habitButtons(container, d) {
  container.replaceChildren();
  const day = state.habits[d];
  const shown = activeHabits();
  for (const g of HABIT_GROUPS) {
    const hs = shown.filter(h => h.group === g.id);
    if (!hs.length) continue;
    const wrap = el('div', 'moods');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', g.label);
    for (const h of hs) {
      const level = (day && day[h.id]) || 0;
      const max = h.levels ? h.levels.length : 1;
      const b = el('button', null, `${h.emoji} ${h.label}` + (level && h.levels ? ` · ${h.levels[level - 1]}` : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!!level));
      if (h.levels) b.title = `Tap again for more: ${h.levels.join(' → ')}`;
      b.addEventListener('click', () => setHabit(d, h.id, level >= max ? 0 : level + 1));
      wrap.append(b);
    }
    container.append(el('p', 'group-label muted small', g.label), wrap);
  }
  const isNone = !!day && !Object.keys(day).length;
  const none = el('button', null, '∅ None of these');
  none.type = 'button';
  none.setAttribute('aria-pressed', String(isNone));
  none.addEventListener('click', () => setHabitDay(d, isNone ? null : {}));
  const row = el('div', 'moods none-row');
  row.append(none);
  container.append(row);
}

function renderHabits(a) {
  const today = todayIso();
  habitButtons($('habit-today'), today);
  renderHabitManage();

  const box = $('habit-stats');
  box.replaceChildren();
  const f = habitInsights(a);
  if (!f.ready) {
    const bar = el('div', 'progress');
    const fill = el('span');
    fill.style.width = Math.min(100, Math.round(100 * f.span / HABIT_MIN_SPAN)) + '%';
    bar.append(fill);
    const needs = [];
    if (f.span < HABIT_MIN_SPAN) needs.push(`${HABIT_MIN_SPAN - f.span} more days of tracking`);
    if (!a.last) needs.push('at least one logged period');
    box.append(el('h3', null, 'What affects your sleep and mood'),
      el('p', 'muted small', 'After about 2 months of logging, this shows which habits go with bad nights or certain moods, and when in your cycle each habit tends to happen.'),
      bar,
      el('p', 'muted small', needs.length ? `Still needed: ${needs.join(', ')}.` : 'Almost there.'));
    return;
  }

  const pct = x => `${Math.round(100 * x)}%`;
  const more = r => (r.observed > r.expected ? 'more' : 'less');
  const section = (title, items, line, empty) => {
    box.append(el('h3', null, title));
    if (!items.length) { box.append(el('p', 'muted small', empty)); return; }
    const list = el('ul', 'findings');
    for (const it of items.slice(0, HABIT_SHOW)) list.append(el('li', null, line(it)));
    box.append(list);
  };
  section('Linked to your sleep', f.sleep,
    r => `${r.f.label}: ${r.observed > r.expected ? 'more' : 'fewer'} bad nights after these days. ${pct(r.observed)} vs ${pct(r.expected)} expected for the same cycle phases (${plural(r.n, 'day')}).`,
    'No habit stands out for your sleep yet.');
  section('Linked to your mood', f.mood,
    r => `${r.f.label}: ${r.mood.emoji} ${r.mood.label} ${more(r)} often on these days. ${pct(r.observed)} vs ${pct(r.expected)} expected for the same cycle phases (${plural(r.n, 'day')}).`,
    'No habit stands out for your mood yet.');
  section('Across your cycle', f.cycle,
    r => `${r.f.label}: most common ${r.phase.when} (${pct(r.rate)} of those days vs ${pct(r.overall)} overall).`,
    "Your habits don't seem tied to one part of your cycle.");
  box.append(el('p', 'muted small', 'Each habit is compared with days without it in the same parts of your cycle, so PMS-time changes aren’t blamed on a habit. These are links in your own data, not proof of cause.'));
}

function renderHabitManage() {
  const box = $('habit-manage');
  box.replaceChildren();
  for (const h of allHabits()) {
    const row = el('div', 'habit-row');
    const label = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !state.hiddenHabits.includes(h.id);
    cb.addEventListener('change', () => setHabitHidden(h.id, !cb.checked));
    label.append(cb, el('span', null, ` ${h.emoji} ${h.label}`));
    row.append(label);
    if (h.group === 'custom') {
      const rm = el('button', 'danger', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', () => removeCustomHabit(h));
      row.append(rm);
    }
    box.append(row);
  }
}

function renderCalendar(a) {
  const { predicted, fertile, ovulation } = predictions(a);
  const marked = new Set(state.days);
  const today = todayIso();

  $('mode-period').setAttribute('aria-pressed', String(tapMode === 'period'));
  $('mode-mood').setAttribute('aria-pressed', String(tapMode === 'mood'));
  $('cal-hint').textContent = tapMode === 'period'
    ? 'Tap a day to mark or unmark it as a period day.'
    : 'Tap a day to log its moods, habits and how you slept the night before.';

  $('month-label').textContent = fmt(viewMonth, { month: 'long', year: 'numeric' });

  const grid = $('calendar');
  grid.replaceChildren();
  // Monday-first grid
  const offset = (new Date(toMs(viewMonth)).getUTCDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(el('span', 'cell empty'));

  const nextMonth = addMonths(viewMonth, 1);
  for (let d = viewMonth; d < nextMonth; d = addDays(d, 1)) {
    const b = el('button', 'cell');
    b.type = 'button';
    b.append(el('span', null, String(Number(d.slice(8)))));
    const dayMoods = (state.moods[d] || []).map(id => MOOD_BY_ID[id]);
    const sick = !!(state.habits[d] && state.habits[d].sick);
    const marks = [...(sick ? ['🤒'] : []), ...dayMoods.map(m => m.emoji)];
    if (marks.length) {
      // Room for two emoji in a calendar cell; '+' hints at more.
      b.append(el('span', 'mood-mark', marks.slice(0, 2).join('') + (marks.length > 2 ? '+' : '')));
    }
    if (marked.has(d)) b.classList.add('period');
    else if (predicted.has(d)) b.classList.add('predicted');
    else if (ovulation.has(d)) b.classList.add('ovulation');
    else if (fertile.has(d)) b.classList.add('fertile');
    if (state.sleep[d]) b.classList.add(`sleep-${state.sleep[d]}`);
    if (d === today) b.classList.add('today');
    if (d > today) b.classList.add('future');
    b.setAttribute('aria-label', fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) +
      (marked.has(d) ? ', period' : '') + (dayMoods.length ? `, mood ${dayMoods.map(m => m.label).join(', ')}` : '') +
      (state.sleep[d] ? `, ${SLEEP_BY_ID[state.sleep[d]].label.toLowerCase()}` : '') + (sick ? ', sick' : ''));
    if (tapMode === 'period') b.setAttribute('aria-pressed', String(marked.has(d)));
    b.addEventListener('click', () => (tapMode === 'period' ? toggleDay(d) : openMoodDialog(d)));
    grid.append(b);
  }
}

function renderMonthRecap(a) {
  const box = $('month-recap');
  if (!box) return; // an older cached page without the recap card
  box.replaceChildren();
  const today = todayIso();
  const s = monthStats(viewMonth, a);
  const soFar = !s.complete && viewMonth <= today ? ' so far' : '';
  box.append(el('h2', null, `${fmt(viewMonth, { month: 'long', year: 'numeric' })} recap${soFar}`));
  if (viewMonth > today) {
    box.append(el('p', 'muted small', 'This month hasn’t started yet.'));
    return;
  }
  const section = title => box.append(el('h3', null, title));

  // Mood
  section('Mood');
  const tone = monthTone(s);
  if (!tone) {
    box.append(el('p', 'muted small', s.moodDays.length
      ? `Only ${plural(s.moodDays.length, 'day')} with a mood logged. Log a few more to see how the month felt.`
      : 'No moods logged this month.'));
  } else {
    const label = { good: '🌤️ Mostly a good month', mixed: '⛅ A mixed month', tough: '🌧️ A tough month' }[tone];
    box.append(el('p', 'recap-tone', label));
    const top = Object.entries(s.moodCount).sort((x, y) => y[1] - x[1]).slice(0, 3);
    const chips = el('div', 'recap-moods');
    for (const [id, n] of top) chips.append(el('span', 'chip', `${MOOD_BY_ID[id].emoji} ${MOOD_BY_ID[id].label} · ${plural(n, 'day')}`));
    box.append(chips);
    const parts = [`${plural(s.good.length, 'good day')}, ${plural(s.tough.length, 'tough day')} out of ${s.moodDays.length} logged.`];
    const ph = s.tough.length >= 3 && mainPhase(s.tough, a);
    if (ph) parts.push(`Tough days were mostly ${ph.when}.`);
    box.append(el('p', 'muted small', parts.join(' ')));
  }

  // Cycle
  section('Cycle');
  if (!s.periods.length) {
    const expected = a.nextStart && a.nextStart >= viewMonth && a.nextStart < addMonths(viewMonth, 1) && !s.complete;
    box.append(el('p', null, expected
      ? `No period yet. Next one expected around ${fmt(a.nextStart, { weekday: 'short', day: 'numeric', month: 'short' })}.`
      : 'No period started this month.'));
  }
  for (const p of s.periods.map(p => periodRecap(p, a))) {
    const lines = [`🩸 Period started ${fmt(p.start, { weekday: 'short', day: 'numeric', month: 'short' })}, ` +
      (p.ongoing ? `day ${diffDays(p.start, today) + 1} so far.` : `lasted ${plural(p.length, 'day')}.`)];
    if (p.cycle != null) {
      let line = `Cycle before it: ${plural(p.cycle, 'day')}`;
      if (p.shift != null) {
        line += ` (your average was ${p.avg}). ` + (Math.abs(p.shift) <= 1 ? 'Right on time.'
          : `Came ${plural(Math.abs(p.shift), 'day')} ${p.shift > 0 ? 'later' : 'earlier'} than expected.`);
      } else line += '.';
      lines.push(line);
    }
    for (const l of lines) box.append(el('p', null, l));
  }

  // Sleep
  section('Sleep');
  if (!s.bad.length) {
    box.append(el('p', null, s.sleepNights ? 'No bad nights logged. 🌙' : 'No sleep logged.'));
  } else {
    const poor = s.bad.length - s.insomnia;
    box.append(el('p', null, [s.insomnia && `${plural(s.insomnia, 'night')} of insomnia`, poor && plural(poor, 'poor night')]
      .filter(Boolean).join(' · ')));
    const ph = mainPhase(s.bad, a);
    if (ph) box.append(el('p', 'muted small', `Most bad nights were ${ph.when}.`));
  }

  // What happened: sick days and the habits logged most often
  section('What happened');
  if (!s.habitDays) {
    box.append(el('p', 'muted small', 'Nothing logged this month. Tap a day in “Mood, sleep & habits” mode to add what happened, like being sick.'));
  } else {
    const sick = s.habitCount.sick || 0;
    box.append(el('p', null, sick ? `🤒 Sick ${plural(sick, 'day')}.` : 'No sick days logged.'));
    const byId = Object.fromEntries(allHabits().map(h => [h.id, h]));
    const top = Object.entries(s.habitCount).filter(([id]) => id !== 'sick' && byId[id])
      .sort((x, y) => y[1] - x[1]).slice(0, 3);
    if (top.length) {
      box.append(el('p', 'muted small', 'Most logged: ' +
        top.map(([id, n]) => `${byId[id].emoji} ${byId[id].label} (${plural(n, 'day')})`).join(', ') +
        ` · ${plural(s.habitDays, 'day')} logged.`));
    }
  }

  // Compared with the month before
  const lines = compareMonths(s, monthStats(addMonths(viewMonth, -1), a));
  if (lines.length) {
    section(`Compared with ${fmt(addMonths(viewMonth, -1), { month: 'long' })}`);
    const list = el('ul', 'findings');
    for (const l of lines) list.append(el('li', null, l));
    box.append(list);
  }

  renderRecapCharts(box, a);
}

function svg(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Round a chart's top value up to 5, 10, 20, 50, 100...
function niceMax(v) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map(k => k * p).find(n => n >= v);
}

// A line chart of up to three series on one shared scale.
// series: [{ slot (1-3, picks the colour), values: [number | null] }], where null
// (nothing logged) breaks the line instead of dropping it to zero.
// readout(i) gives the tooltip for position i: { head, rows: [{ slot, value, name }] }.
// Hover, tap or arrow keys show the readout; the table below has every value too.
function lineChart({ series, n, max, topLabel, ticks, width, title, readout }) {
  const H = 110, TOP = 16, BOTTOM = 18;
  const slot = width / n;
  const base = TOP + H;
  const px = i => (i + 0.5) * slot;
  const py = v => base - H * Math.min(v, max) / max;
  const wrap = el('div', 'chart');
  const chart = svg('svg', { width, height: TOP + H + BOTTOM, viewBox: `0 0 ${width} ${TOP + H + BOTTOM}`,
    role: 'img', tabindex: '0', 'aria-label': `${title}. Use the left and right arrow keys to read each value.` });
  chart.append(svg('line', { x1: 0, x2: width, y1: TOP, y2: TOP, class: 'chart-grid' }),
    svg('line', { x1: 0, x2: width, y1: base, y2: base, class: 'chart-axis' }));
  const top = svg('text', { x: 0, y: TOP - 5, class: 'chart-label' });
  top.textContent = topLabel;
  chart.append(top);
  for (const s of series) {
    // Unbroken runs of logged values. A lone one has no neighbours to join, so it shows as a dot.
    const runs = [];
    s.values.forEach((v, i) => {
      if (v == null) return;
      const last = runs[runs.length - 1];
      if (last && last[last.length - 1] === i - 1) last.push(i);
      else runs.push([i]);
    });
    for (const run of runs) {
      const line = run.map((i, k) => `${k ? 'L' : 'M'}${px(i)},${py(s.values[i])}`).join('');
      if (run.length > 1) {
        // A light wash under a single line; with several it would only muddy them.
        if (series.length === 1) {
          chart.append(svg('path', { class: `chart-area s${s.slot}`, d: `${line}L${px(run[run.length - 1])},${base}L${px(run[0])},${base}Z` }));
        }
        chart.append(svg('path', { class: `chart-line s${s.slot}`, d: line }));
      } else {
        chart.append(svg('circle', { class: `chart-dot s${s.slot}`, cx: px(run[0]), cy: py(s.values[run[0]]), r: 4 }));
      }
    }
  }
  const cross = svg('line', { y1: TOP, y2: base, class: 'chart-cross', visibility: 'hidden' });
  chart.append(cross);
  const focus = series.map(s => {
    const dot = svg('circle', { r: 4, class: `chart-dot s${s.slot}`, visibility: 'hidden' });
    chart.append(dot);
    return dot;
  });
  for (const [i, label] of ticks) {
    const t = svg('text', { x: Math.min(width - 2, Math.max(2, (i + 0.5) * slot)), y: base + 13, class: 'chart-label tick' });
    t.textContent = label;
    chart.append(t);
  }
  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  let current = -1;
  const show = i => {
    current = Math.max(0, Math.min(n - 1, i));
    const x = px(current);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = s.values[current];
      if (v != null) { focus[k].setAttribute('cx', x); focus[k].setAttribute('cy', py(v)); }
      focus[k].setAttribute('visibility', v != null ? 'visible' : 'hidden');
    });
    // Values lead, names follow; a short line in the series colour keys each row.
    const r = readout(current);
    tip.replaceChildren(el('div', 'tip-head', r.head));
    for (const row of r.rows) {
      const line = el('div', 'tip-row');
      line.append(el('span', `tip-key s${row.slot}`), el('strong', null, row.value), el('span', 'tip-name', row.name));
      tip.append(line);
    }
    tip.hidden = false;
    tip.style.left = Math.min(width - tip.offsetWidth, Math.max(0, x - tip.offsetWidth / 2)) + 'px';
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    for (const f of focus) f.setAttribute('visibility', 'hidden');
    current = -1;
    tip.hidden = true;
  };
  chart.addEventListener('pointermove', e => show(Math.floor((e.clientX - chart.getBoundingClientRect().left) / slot)));
  chart.addEventListener('pointerdown', e => show(Math.floor((e.clientX - chart.getBoundingClientRect().left) / slot)));
  chart.addEventListener('pointerleave', hide);
  chart.addEventListener('blur', hide);
  chart.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      show(current < 0 ? 0 : current + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') hide();
  });
  wrap.append(tip, chart);
  return wrap;
}

// Turn a line on or off. A new line takes the first free colour, and lines already
// shown keep theirs, so a colour always means the same thing while it's on screen.
async function toggleChartPick(key) {
  const picks = chartPicks();
  const at = picks.indexOf(key);
  if (at >= 0) picks[at] = null;
  else {
    const free = picks.indexOf(null);
    if (free < 0) return false;
    picks[free] = key;
  }
  state.chartPicks = picks;
  await save();
  renderMonthRecap(analyse());
  return true;
}

function chartPicks() {
  return state.chartPicks ? [...state.chartPicks] : ['alcohol', 'meetings', null];
}

function renderRecapCharts(box, a) {
  const today = todayIso();
  const year = viewMonth.slice(0, 4);
  box.append(el('h3', null, 'Charts'));
  const toggle = el('div', 'mode recap-range');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Chart period');
  for (const [id, label] of [['month', fmt(viewMonth, { month: 'long' })], ['year', year]]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(recapRange === id));
    b.addEventListener('click', () => { recapRange = id; renderMonthRecap(analyse()); });
    toggle.append(b);
  }
  box.append(toggle);

  const width = Math.max(220, box.clientWidth - 32);
  const days = rangeDays(recapRange);
  const months = recapRange === 'year' ? Array.from({ length: 12 }, (_, i) => addMonths(days[0], i)) : null;
  const columns = months || days;
  const picks = chartPicks();

  // Everything with data in this period, with its values per day or per month.
  const avail = [];
  for (const def of RECAP_CHARTS) {
    const c = chartSeries(def);
    if (!c) continue;
    const t = chartTotals(c, days);
    if (!t.hit) continue;
    const summary = c.key === 'sleep' ? c.total(t.hit) : c.total(t.sum) + (c.amount ? ` · ${plural(t.hit, 'day')}` : '');
    let values, texts, cells;
    if (months) {
      // Per month: the share of logged days with the habit, so different habits share one scale.
      const totals = months.map(m => (m > today ? null : chartTotals(c, daysBetween(m, 1))));
      values = totals.map(mt => (mt && mt.logged ? mt.hit / mt.logged : null));
      texts = totals.map(mt => (!mt ? 'not yet' : !mt.logged ? 'not logged'
        : `${c.key === 'sleep' ? c.total(mt.hit) : c.total(mt.sum)}${c.amount ? ` over ${plural(mt.hit, 'day')}` : ''} (${Math.round(100 * mt.hit / mt.logged)}%)`));
      cells = totals.map(mt => (!mt ? '' : !mt.logged ? '–' : c.key === 'sleep' ? c.total(mt.hit) : c.total(mt.sum)));
    } else {
      // Per day: how high that day's level is, from none (0) to the habit's top level (1).
      const raw = days.map(d => (d > today ? null : c.value(d)));
      values = raw.map(v => (v == null ? null : v / c.levels.length));
      texts = raw.map((v, i) => (days[i] > today ? 'not yet' : levelText(c, v)));
      cells = raw.map((v, i) => (days[i] > today ? '' : v == null ? '–' : levelText(c, v)));
    }
    avail.push({ c, summary, values, texts, cells, slot: picks.indexOf(c.key) + 1 });
  }
  if (!avail.length) {
    box.append(el('p', 'muted small', `Nothing to chart for ${recapRange === 'year' ? year : 'this month'} yet. Log alcohol, meetings, caffeine, sleep and more from the Habits and Sleep cards.`));
    return;
  }

  // The legend doubles as the picker: tap to show or hide a line, up to three at once.
  const legend = el('div', 'chart-picker');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', 'Lines to show');
  const full = picks.every(Boolean);
  const note = el('p', 'muted small picker-note', 'Up to 3 lines at a time. Turn one off to add another.');
  note.hidden = true;
  for (const s of avail) {
    const b = el('button', s.slot ? `chip-pick s${s.slot}` : 'chip-pick');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!!s.slot));
    b.append(el('span', 'pick-key'), el('span', null, `${s.c.emoji} ${s.c.title}`), el('span', 'pick-total', s.summary));
    b.addEventListener('click', async () => {
      if (!(await toggleChartPick(s.c.key))) note.hidden = false;
    });
    if (!s.slot && full) b.title = 'Up to 3 lines at a time';
    legend.append(b);
  }
  box.append(legend, note);

  const shown = avail.filter(s => s.slot).sort((x, y) => x.slot - y.slot);
  if (!shown.length) {
    box.append(el('p', 'muted small', 'Pick up to 3 to draw them on the chart.'));
  } else {
    const n = columns.length;
    const max = months ? Math.min(1, niceMax(100 * Math.max(...shown.flatMap(s => s.values.map(v => v || 0)))) / 100) : 1;
    const ticks = months
      ? months.map((m, i) => [i, fmt(m, { month: 'narrow' })])
      : [0, 7, 14, 21, 28].filter(i => i < days.length).map(i => [i, String(i + 1)]);
    const names = shown.map(s => s.c.title).join(', ');
    box.append(lineChart({
      series: shown.map(s => ({ slot: s.slot, values: s.values })),
      n, max, ticks, width,
      topLabel: months ? `${Math.round(100 * max)}% of days` : 'most',
      title: `${names}, ${months ? `share of logged days per month in ${year}` : `per day in ${fmt(viewMonth, { month: 'long', year: 'numeric' })}`}`,
      readout: i => ({
        head: months ? fmt(columns[i], { month: 'long' }) : fmt(columns[i], { weekday: 'short', day: 'numeric', month: 'short' }),
        rows: shown.map(s => ({ slot: s.slot, value: s.texts[i], name: s.c.title })),
      }),
    }));
  }
  box.append(el('p', 'muted small', recapRange === 'year'
    ? 'Each point is the share of logged days with that habit in the month (for sleep, the share of bad nights). Months with nothing logged leave a gap. Tap the chart for totals.'
    : 'Each line goes from none at the bottom to its highest level at the top (5+ drinks, meetings all day, insomnia…). Days with nothing logged leave a gap. Tap the chart for details.'));
  const table = avail.map(s => ({ title: `${s.c.emoji} ${s.c.title}`, cells: s.cells }));

  // Every charted value, for reading without the charts.
  const details = el('details', 'chart-table');
  details.append(el('summary', 'small', 'See the numbers'));
  const tbl = el('table');
  const hr = el('tr');
  hr.append(el('th', null, recapRange === 'year' ? 'Month' : 'Day'));
  for (const col of table) hr.append(el('th', null, col.title));
  tbl.append(hr);
  columns.forEach((col, i) => {
    if (col > today) return;
    const tr = el('tr');
    tr.append(el('td', null, months ? fmt(col, { month: 'short' }) : fmt(col, { weekday: 'short', day: 'numeric' })));
    for (const t of table) tr.append(el('td', null, t.cells[i]));
    tbl.append(tr);
  });
  const scroll = el('div', 'table-scroll');
  scroll.append(tbl);
  details.append(scroll);
  box.append(details);

  const insights = recapInsights(recapRange, a);
  if (insights.length) {
    box.append(el('h3', null, 'Insights'));
    const list = el('ul', 'findings');
    for (const l of insights) list.append(el('li', null, l));
    box.append(list, el('p', 'muted small', `Counted over ${recapRange === 'year' ? year : 'this month'}. Patterns in your own data, not proof of cause.`));
  }
}

function renderHistory(a) {
  const box = $('history');
  box.replaceChildren();
  if (!a.ps.length) { box.append(el('p', 'muted', 'No periods logged yet.')); return; }
  const table = el('table');
  const head = el('tr');
  ['Started', 'Period', 'Cycle'].forEach(h => head.append(el('th', null, h)));
  table.append(head);
  for (let i = a.ps.length - 1; i >= Math.max(0, a.ps.length - 12); i--) {
    const p = a.ps[i];
    const tr = el('tr');
    tr.append(
      el('td', null, fmt(p.start, { day: 'numeric', month: 'short', year: 'numeric' })),
      el('td', null, `${diffDays(p.start, p.end) + 1} d`),
      el('td', null, i < a.cycles.length ? `${a.cycles[i]} d` : 'current'));
    table.append(tr);
  }
  box.append(table);
}

// ---------- actions ----------

async function toggleDay(d) {
  const set = new Set(state.days);
  if (set.has(d)) set.delete(d);
  else {
    if (d > todayIso() && !confirm('Mark a future day as a period day?')) return;
    set.add(d);
  }
  state.days = [...set].sort();
  await save();
  render();
}

async function toggleMood(d, id) {
  const current = state.moods[d] || [];
  const next = current.includes(id) ? current.filter(m => m !== id) : [...current, id];
  await setMoods(d, MOODS.map(m => m.id).filter(m => next.includes(m)));
}

async function setMoods(d, ids) {
  if (ids.length) state.moods[d] = ids;
  else delete state.moods[d];
  await save();
  render();
  if (moodDialogDay === d) refreshMoodDialog();
}

async function setSleep(d, id) {
  if (id) state.sleep[d] = id;
  else delete state.sleep[d];
  await save();
  render();
  if (moodDialogDay === d) refreshMoodDialog();
}

async function setHabitDay(d, day) {
  if (day) state.habits[d] = day;
  else delete state.habits[d];
  await save();
  render();
  if (moodDialogDay === d) refreshMoodDialog();
}

// Untapping the last habit un-logs the day; "None of these" is an explicit tap.
async function setHabit(d, id, level) {
  const day = { ...(state.habits[d] || {}) };
  if (level) day[id] = level;
  else delete day[id];
  await setHabitDay(d, Object.keys(day).length ? day : null);
}

async function setHabitHidden(id, hidden) {
  state.hiddenHabits = state.hiddenHabits.filter(h => h !== id);
  if (hidden) state.hiddenHabits.push(id);
  await save();
  render();
}

async function addCustomHabit(emoji, name) {
  const label = name.trim().slice(0, 30);
  if (!label) return false;
  if (allHabits().some(h => h.label.toLowerCase() === label.toLowerCase())) {
    alert('You already have a habit with that name.');
    return false;
  }
  state.customHabits.push({ id: 'c' + Date.now().toString(36), emoji: firstGrapheme(emoji) || '⭐', label, since: todayIso() });
  await save();
  render();
  return true;
}

async function removeCustomHabit(h) {
  if (!confirm(`Remove “${h.label}” and everything logged for it?`)) return;
  state.customHabits = state.customHabits.filter(c => c.id !== h.id);
  state.hiddenHabits = state.hiddenHabits.filter(id => id !== h.id);
  for (const day of Object.values(state.habits)) delete day[h.id];
  await save();
  render();
}

function refreshMoodDialog() {
  const d = moodDialogDay;
  moodButtons($('mood-dialog-options'), d);
  sleepButtons($('sleep-dialog-options'), d);
  habitButtons($('habit-dialog-options'), d);
  $('mood-clear').hidden = !state.moods[d] && !state.sleep[d] && !state.habits[d];
}

function openMoodDialog(d) {
  if (d > todayIso()) { alert('You can only log moods, sleep and habits for today or past days.'); return; }
  moodDialogDay = d;
  $('mood-dialog-title').textContent = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
  refreshMoodDialog();
  $('mood-dialog').returnValue = ''; // close() without a value keeps the previous one
  $('mood-dialog').showModal();
}

async function exportBackup() {
  const blob = new Blob([JSON.stringify(
    { app: 'follow-the-flow', version: 5, days: state.days, moods: state.moods, sleep: state.sleep,
      habits: state.habits, customHabits: state.customHabits, hiddenHabits: state.hiddenHabits }, null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `follow-the-flow-${todayIso()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.lastExport = todayIso();
  state.snoozeUntil = null;
  await save();
  render();
}

async function snoozeReminder() {
  state.snoozeUntil = addDays(todayIso(), 1);
  await save();
  render();
}

async function importBackup(file) {
  try {
    const incoming = sanitize(JSON.parse(await file.text()));
    const moodCount = Object.keys(incoming.moods).length;
    const sleepCount = Object.keys(incoming.sleep).length;
    const habitCount = Object.keys(incoming.habits).length;
    if (!confirm(`Import ${incoming.days.length} period days, moods for ${moodCount} days, ${sleepCount} bad nights and habits for ${habitCount} days? They will be merged with your current data.`)) return;
    state.days = [...new Set([...state.days, ...incoming.days])].sort();
    for (const [d, ids] of Object.entries(incoming.moods)) {
      const merged = new Set([...(state.moods[d] || []), ...ids]);
      state.moods[d] = MOODS.map(m => m.id).filter(id => merged.has(id));
    }
    for (const [d, v] of Object.entries(incoming.sleep)) {
      // If both copies logged the night, keep the worse one.
      if (state.sleep[d] !== 'insomnia') state.sleep[d] = v;
    }
    for (const c of incoming.customHabits) {
      if (!state.customHabits.some(x => x.id === c.id)) state.customHabits.push(c);
    }
    for (const [d, day] of Object.entries(incoming.habits)) {
      // If both copies logged a habit, keep the higher level.
      const merged = { ...(state.habits[d] || {}) };
      for (const [id, lv] of Object.entries(day)) merged[id] = Math.max(merged[id] || 0, lv);
      state.habits[d] = merged;
    }
    await save();
    render();
  } catch {
    alert('That file could not be read as a Follow the Flow backup.');
  }
}

async function setPassphrase() {
  const p1 = prompt('Choose a passphrase. If you forget it, your data cannot be recovered.');
  if (!p1) return;
  const p2 = prompt('Repeat the passphrase:');
  if (p1 !== p2) { alert('The passphrases did not match.'); return; }
  salt = crypto.getRandomValues(new Uint8Array(16));
  cryptoKey = await deriveKey(p1, salt);
  await save();
  render();
}

async function removePassphrase() {
  if (!confirm('Store your data unencrypted on this device?')) return;
  cryptoKey = null;
  salt = null;
  await save();
  render();
}

async function wipe() {
  if (!confirm('Delete all your data from this device? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = emptyState();
  cryptoKey = null;
  salt = null;
  render();
}

function lockNow() {
  state = emptyState();
  cryptoKey = null;
  salt = null;
  showLock();
}

function showLock() {
  $('app').hidden = true;
  $('lock').hidden = false;
  $('unlock-pass').value = '';
  $('unlock-pass').focus();
}

function showApp() {
  $('lock').hidden = true;
  $('app').hidden = false;
  if (hasData() && !state.createdAt) save(); // start the backup-reminder clock for older data
  render();
}

// ---------- startup ----------

function init() {
  const wd = $('weekdays');
  // 2024-01-01 was a Monday
  for (let i = 0; i < 7; i++) wd.append(el('span', null, fmt(addDays('2024-01-01', i), { weekday: 'narrow' })));

  $('prev').addEventListener('click', () => { viewMonth = addMonths(viewMonth, -1); render(); });
  $('next').addEventListener('click', () => { viewMonth = addMonths(viewMonth, 1); render(); });
  // Charts are drawn to the card's width, so redraw them when it changes.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!$('app').hidden) renderMonthRecap(analyse()); }, 150);
  });
  $('export').addEventListener('click', exportBackup);
  $('import').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
  $('set-pass').addEventListener('click', setPassphrase);
  $('remove-pass').addEventListener('click', removePassphrase);
  $('lock-now').addEventListener('click', lockNow);
  $('wipe').addEventListener('click', wipe);
  $('reminder-export').addEventListener('click', exportBackup);
  $('reminder-snooze').addEventListener('click', snoozeReminder);
  $('mode-period').addEventListener('click', () => { tapMode = 'period'; render(); });
  $('mode-mood').addEventListener('click', () => { tapMode = 'mood'; render(); });
  $('habit-add').addEventListener('submit', async e => {
    e.preventDefault();
    if (await addCustomHabit($('habit-emoji').value, $('habit-name').value)) {
      $('habit-emoji').value = '';
      $('habit-name').value = '';
    }
  });
  $('mood-dialog').addEventListener('close', () => {
    const d = moodDialogDay;
    moodDialogDay = null;
    if ($('mood-dialog').returnValue === 'clear' && d) {
      delete state.sleep[d];
      delete state.habits[d];
      setMoods(d, []);
    }
  });

  $('unlock-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const res = await decrypt(loadRaw(), $('unlock-pass').value);
      cryptoKey = res.key;
      salt = res.salt;
      state = sanitize(res.data);
      $('unlock-error').hidden = true;
      showApp();
    } catch {
      $('unlock-error').hidden = false;
    }
  });

  const raw = loadRaw();
  if (raw && raw.enc) showLock();
  else {
    state = sanitize(raw && raw.data);
    showApp();
  }

  // Offline support: cache the app's own files. The service worker only ever
  // serves this app's static files and never contacts any other host.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      // An installed app can stay open for days: look for a new version whenever it comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
    // When a new version takes over, reload once so the page runs the new code.
    // Data is saved on every change, so nothing is lost.
    if (navigator.serviceWorker.controller) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) { reloaded = true; location.reload(); }
      });
    }
  }
}

init();
