'use strict';
/* ---------- Small helpers shared by every file ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DAY_MS = 86400000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const SLOTS = ['morning', 'afternoon', 'evening'];
const SLOT_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const SLOT_SHORT = { morning: 'AM', afternoon: 'Aft', evening: 'Eve' };
const IMPORTANCE = { high: { label: 'High', rank: 0 }, med: { label: 'Medium', rank: 1 }, low: { label: 'Low', rank: 2 } };
const FREQ_PRESETS = [[7, 'Weekly'], [14, 'Every 2 weeks'], [21, 'Every 3 weeks'], [30, 'Monthly'], [45, 'Every 6 weeks'], [60, 'Every 2 months'], [90, 'Quarterly']];
const ROUTE_COLORS = ['#4ea1ff', '#e8a33d', '#3cc6a8', '#ff5c7a', '#a98bff', '#7bd88f', '#ff9f5a', '#5ad1e8', '#d4c95a', '#c78bd6'];
const TAG_COLORS = ['#7bd88f', '#f2cc4d', '#5ad1e8', '#9aa5b1', '#ff5c7a', '#4ea1ff', '#e8a33d', '#a98bff', '#ff9f5a', '#c78bd6'];
const PLACEMENT_TYPES = { backBar: 'Back bar', well: 'Well', cocktail: 'Cocktail' };
const THEMES = [
  ['midnight', 'Midnight', '#0e141b', '#4ea1ff'], ['bourbon', 'Bourbon', '#15100b', '#e8a33d'],
  ['agave', 'Agave', '#0b1514', '#3cc6a8'], ['ruby', 'Ruby', '#150b0f', '#ff5c7a'],
  ['violet', 'Violet', '#100d18', '#a98bff'], ['forest', 'Forest', '#0c130d', '#7bd88f'],
  ['light', 'Light', '#f3f5f8', '#1f6feb'],
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysBetween(a, b = new Date()) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }
function parseDate(iso) { return new Date(iso && iso.length === 10 ? iso + 'T12:00:00' : iso); }
function fmtDate(iso, withYear) {
  if (!iso) return '';
  const d = parseDate(iso);
  const o = { month: 'short', day: 'numeric' };
  if (withYear || d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString(undefined, o);
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtDateTime(iso) { return `${fmtDate(iso)} · ${fmtTime(iso)}`; }
function fmtDayHeading(iso) { return parseDate(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }); }
function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n === -1) return 'tomorrow';
  if (n < 0) return `in ${-n} days`;
  return `${n} days ago`;
}
function fmtHM(hm) {
  if (!hm) return '?';
  const [h, m] = hm.split(':').map(Number);
  const ap = h < 12 ? 'a' : 'p';
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, '0')}${ap}` : `${h12}${ap}`;
}
const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(d = new Date()) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function toLocalDate(d = new Date()) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return WEEKDAYS[new Date().getDay()]; }
function currentSlot() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
function norm(s) { return String(s ?? '').trim().toLowerCase(); }
function plural(n, w, p) { return `${n} ${n === 1 ? w : (p || w + 's')}`; }
function telHref(p) { return 'tel:' + String(p).replace(/[^\d+]/g, ''); }
function smsHref(p) { return 'sms:' + String(p).replace(/[^\d+]/g, ''); }
/* Email links. With the "outlook" setting: Android opens the Outlook app directly (falls back to
   Outlook on the web if the app isn't installed), iPhone uses Outlook's link, computers open Outlook on the web. */
function mailAttrs(email) {
  const mode = (typeof Store !== 'undefined' && Store.state?.settings?.emailApp) || 'outlook';
  const e = String(email || '').trim();
  const web = 'https://outlook.office.com/mail/deeplink/compose?to=' + encodeURIComponent(e);
  if (mode === 'default') return `href="mailto:${esc(e)}"`;
  if (mode === 'outlookweb') return `href="${esc(web)}" target="_blank" rel="noopener"`;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return `href="${esc(`intent:${e}#Intent;scheme=mailto;package=com.microsoft.office.outlook;S.browser_fallback_url=${encodeURIComponent(web)};end`)}"`;
  if (/iPhone|iPad/i.test(ua)) return `href="${esc('ms-outlook://compose?to=' + encodeURIComponent(e))}"`;
  return `href="${esc(web)}" target="_blank" rel="noopener"`;
}
function mapHref(a) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a); }
function sortBy(arr, fn) { return arr.slice().sort((a, b) => { const x = fn(a), y = fn(b); return x < y ? -1 : x > y ? 1 : 0; }); }
function words(q) { return norm(q).split(/\s+/).filter(Boolean); }
function matchesAll(hay, ws) { hay = norm(hay); return ws.every((w) => hay.includes(w)); }
function sizeValue(size) {
  const m = String(size || '').toLowerCase().replace(',', '.').match(/([\d.]+)\s*(ml|l|lt|liter|litre|oz)?/);
  if (!m) return 99999;
  const n = parseFloat(m[1]);
  if (m[2] === 'oz') return n * 29.57;
  if (m[2] && m[2].startsWith('l')) return n * 1000;
  return n;
}
/* "jess park" -> "Jess Park" (leaves names with any capitals alone, e.g. "McKnight") */
function niceName(s) { s = String(s || '').trim().replace(/\s+/g, ' '); return s === s.toLowerCase() ? s.replace(/(^|[\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase()) : s; }
function uniqSorted(arr) { return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b)); }

const ICON_PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  map: '<path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
  bottle: '<path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z"/><path d="M8 13h8"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3A6.5 6.5 0 0 1 21.5 20"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
function icon(n) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[n] || ''}</svg>`;
}
