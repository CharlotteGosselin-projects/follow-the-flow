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

let state = { days: [] };  // days: sorted ISO dates ('YYYY-MM-DD') marked as period days
let cryptoKey = null;      // set when a passphrase protects the data
let salt = null;
let viewMonth = startOfMonth(todayIso());

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

// ---------- persistence ----------

async function save() {
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

function sanitize(data) {
  const days = Array.isArray(data && data.days) ? data.days : [];
  const valid = days.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(toMs(d)));
  return { days: [...new Set(valid)].sort() };
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
  renderSummary(a);
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

function renderCalendar(a) {
  const { predicted, fertile, ovulation } = predictions(a);
  const marked = new Set(state.days);
  const today = todayIso();

  $('month-label').textContent = fmt(viewMonth, { month: 'long', year: 'numeric' });

  const grid = $('calendar');
  grid.replaceChildren();
  // Monday-first grid
  const offset = (new Date(toMs(viewMonth)).getUTCDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(el('span', 'cell empty'));

  const nextMonth = addMonths(viewMonth, 1);
  for (let d = viewMonth; d < nextMonth; d = addDays(d, 1)) {
    const b = el('button', 'cell', String(Number(d.slice(8))));
    b.type = 'button';
    if (marked.has(d)) b.classList.add('period');
    else if (predicted.has(d)) b.classList.add('predicted');
    else if (ovulation.has(d)) b.classList.add('ovulation');
    else if (fertile.has(d)) b.classList.add('fertile');
    if (d === today) b.classList.add('today');
    if (d > today) b.classList.add('future');
    b.setAttribute('aria-label', fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) +
      (marked.has(d) ? ', period' : ''));
    b.setAttribute('aria-pressed', String(marked.has(d)));
    b.addEventListener('click', () => toggleDay(d));
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

function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'follow-the-flow', version: 1, ...state }, null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `follow-the-flow-${todayIso()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(file) {
  try {
    const incoming = sanitize(JSON.parse(await file.text()));
    if (!confirm(`Import ${incoming.days.length} period days? They will be merged with your current data.`)) return;
    state.days = [...new Set([...state.days, ...incoming.days])].sort();
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
  state = { days: [] };
  cryptoKey = null;
  salt = null;
  render();
}

function lockNow() {
  state = { days: [] };
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
