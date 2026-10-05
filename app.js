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

// days: sorted ISO dates ('YYYY-MM-DD') marked as period days
// moods: { 'YYYY-MM-DD': [moodId, ...] } (several moods per day allowed)
// createdAt / lastExport / snoozeUntil: ISO dates driving the backup reminder
function emptyState() {
  return { days: [], moods: {}, createdAt: null, lastExport: null, snoozeUntil: null };
}

let state = emptyState();
let cryptoKey = null;      // set when a passphrase protects the data
let salt = null;
let viewMonth = startOfMonth(todayIso());
let tapMode = 'period';    // what tapping a calendar day does: 'period' | 'mood'
let moodDialogDay = null;

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
    const cd = ((diffDays(a.last.start, d) % L) + L) % L + 1;
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
  const date = v => (isIsoDate(v) ? v : null);
  return {
    days: [...new Set(days)].sort(), moods,
    createdAt: date(data.createdAt), lastExport: date(data.lastExport), snoozeUntil: date(data.snoozeUntil),
  };
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
  renderReminder();
  renderSummary(a);
  renderMood(a);
  renderCalendar(a);
  renderHistory(a);
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

function hasData() { return state.days.length > 0 || Object.keys(state.moods).length > 0; }

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

function renderCalendar(a) {
  const { predicted, fertile, ovulation } = predictions(a);
  const marked = new Set(state.days);
  const today = todayIso();

  $('mode-period').setAttribute('aria-pressed', String(tapMode === 'period'));
  $('mode-mood').setAttribute('aria-pressed', String(tapMode === 'mood'));
  $('cal-hint').textContent = tapMode === 'period'
    ? 'Tap a day to mark or unmark it as a period day.'
    : 'Tap a day to log or change its moods.';

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
    if (dayMoods.length) {
      // Room for two emoji in a calendar cell; '+' hints at more.
      b.append(el('span', 'mood-mark', dayMoods.slice(0, 2).map(m => m.emoji).join('') + (dayMoods.length > 2 ? '+' : '')));
    }
    if (marked.has(d)) b.classList.add('period');
    else if (predicted.has(d)) b.classList.add('predicted');
    else if (ovulation.has(d)) b.classList.add('ovulation');
    else if (fertile.has(d)) b.classList.add('fertile');
    if (d === today) b.classList.add('today');
    if (d > today) b.classList.add('future');
    b.setAttribute('aria-label', fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) +
      (marked.has(d) ? ', period' : '') + (dayMoods.length ? `, mood ${dayMoods.map(m => m.label).join(', ')}` : ''));
    if (tapMode === 'period') b.setAttribute('aria-pressed', String(marked.has(d)));
    b.addEventListener('click', () => (tapMode === 'period' ? toggleDay(d) : openMoodDialog(d)));
    grid.append(b);
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

function refreshMoodDialog() {
  moodButtons($('mood-dialog-options'), moodDialogDay);
  $('mood-clear').hidden = !state.moods[moodDialogDay];
}

function openMoodDialog(d) {
  if (d > todayIso()) { alert("You can only log moods for today or past days."); return; }
  moodDialogDay = d;
  $('mood-dialog-title').textContent = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
  refreshMoodDialog();
  $('mood-dialog').returnValue = ''; // close() without a value keeps the previous one
  $('mood-dialog').showModal();
}

async function exportBackup() {
  const blob = new Blob([JSON.stringify(
    { app: 'follow-the-flow', version: 3, days: state.days, moods: state.moods }, null, 2)],
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
    if (!confirm(`Import ${incoming.days.length} period days and moods for ${moodCount} days? They will be merged with your current data.`)) return;
    state.days = [...new Set([...state.days, ...incoming.days])].sort();
    for (const [d, ids] of Object.entries(incoming.moods)) {
      const merged = new Set([...(state.moods[d] || []), ...ids]);
      state.moods[d] = MOODS.map(m => m.id).filter(id => merged.has(id));
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
  $('mood-dialog').addEventListener('close', () => {
    const d = moodDialogDay;
    moodDialogDay = null;
    if ($('mood-dialog').returnValue === 'clear' && d) setMoods(d, []);
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
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
