/* Small DOM helpers shared by every view. Content is always inserted with
   textContent, never innerHTML, because lead and client data is untrusted. */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  leads: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  clients: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.9.7 3 2.4 3 5.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  send: '<path d="M20 4 3.5 10.5l6.1 2 2 6.1L20 4Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="10" y="4" width="5" height="10" rx="1.2"/><rect x="17" y="4" width="4" height="13" rx="1.2"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  doc: '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M9 13h6M9 16.5h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4.6a7.6 7.6 0 0 0-1.7-1L14.8 3h-4l-.5 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-.6-2 3.5L6.2 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-.6a7.6 7.6 0 0 0 1.7 1l.5 2.6h4l.5-2.6a7.6 7.6 0 0 0 1.7-1l2.4.6 2-3.5-2-1.5Z"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 18 5M18 5h-3.5M18 5v3.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3 11 14.8l4.5-5.6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.7"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  globe: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 6.2h.01M11 6.2h.01"/>'
};
export function icon(name, size = 18) {
  const s = h('span', { class: 'ico', 'aria-hidden': 'true' });
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  return s;
}

/* ---------- formatting ---------- */
const pad = n => String(n).padStart(2, '0');
export const ymd = d => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const sameDay = (a, b) => ymd(a) === ymd(b);
export const toDate = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? new Date(d + 'T12:00:00') : new Date(d);
export const fmt = {
  date: d => toDate(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
  short: d => toDate(d).toLocaleDateString([], { month: 'short', day: 'numeric' }),
  day: d => toDate(d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
  time: d => toDate(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  ago(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (isNaN(m)) return '';
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const hr = Math.round(m / 60);
    if (hr < 24) return hr + ' h ago';
    const d = Math.round(hr / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
};
export const initials = s => String(s).replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------- small components ---------- */
export const pill = (text, tone) => h('span', { class: 'pill' + (tone ? ' ' + tone : ''), text });
export function avatar(label, tone, abbr) {
  const t = abbr || initials(label);
  return h('span', { class: 'avatar' + (tone ? ' ' + tone : '') + (t.length > 2 ? ' long' : ''), 'aria-hidden': 'true', text: t });
}
let fieldN = 0;
export function field(label, control, hint) {
  if (!control.id) control.id = 'fld' + (++fieldN);
  return h('div', { class: 'field' }, h('label', { for: control.id, text: label }), control, hint ? h('p', { class: 'hint', text: hint }) : null);
}
export function input(props) { return h('input', Object.assign({ type: 'text', autocomplete: 'off' }, props)); }
export function select(options, value, props) {
  const s = h('select', props || {}, options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, text: t }); }));
  if (value != null) s.value = value;
  return s;
}
export function textarea(props, value) { const t = h('textarea', props || {}); t.value = value || ''; return t; }

export function toast(msg) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- drawer and confirm ---------- */
let layer = null, lastFocus = null;
function openLayer(kind, label) {
  closeLayer();
  lastFocus = document.activeElement;
  const body = h('div', { class: kind + '-body' });
  const titleEl = h('h2', { class: kind + '-title', text: label });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeLayer }, icon('x'));
  const panel = h('div', { class: kind, role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('header', { class: kind + '-head' }, titleEl, closeBtn), body);
  const scrim = h('div', { class: 'scrim', onmousedown: e => { if (e.target === scrim) closeLayer(); } }, panel);
  scrim._key = e => { if (e.key === 'Escape') closeLayer(); };
  document.addEventListener('keydown', scrim._key);
  document.body.append(scrim);
  document.body.classList.add('noscroll');
  layer = scrim;
  closeBtn.focus();
  return { body, panel, close: closeLayer, setTitle: t => { titleEl.textContent = t; panel.setAttribute('aria-label', t); } };
}
export function closeLayer() {
  if (!layer) return;
  document.removeEventListener('keydown', layer._key);
  layer.remove(); layer = null;
  document.body.classList.remove('noscroll');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
export const drawer = title => openLayer('drawer', title);

export function confirmBox({ title, lines = [], confirmText = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const m = openLayer('modal', title);
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } closeLayer(); };
    m.body.append(
      lines.map(l => Array.isArray(l)
        ? h('div', { class: 'kv' }, h('span', { class: 'k', text: l[0] }), h('span', { text: l[1] }))
        : h('p', { text: l })),
      h('div', { class: 'actions end' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false), text: 'Cancel' }),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => done(true), text: confirmText })));
    const scrim = layer;
    new MutationObserver((_, obs) => { if (!document.body.contains(scrim)) { obs.disconnect(); done(false); } })
      .observe(document.body, { childList: true });
  });
}

/* ---------- layout pieces ---------- */
export const panel = (title, right, ...kids) =>
  h('section', { class: 'panel' }, h('header', { class: 'panel-head' }, h('h2', { text: title }), right || null), ...kids);
export const empty = (text, action) => h('div', { class: 'empty' }, h('p', { text }), action || null);
export const link = (href, label, cls) => h('a', { href, class: cls || 'text-link', text: label });

/* ---------- info icon ---------- */
/* A small round (i) button that opens a short plain-language explanation next to it.
   Lighter than drawer()/confirmBox(): doesn't block the rest of the page, closes on
   outside click or Escape. Use next to anything non-obvious, not on every control. */
let openInfo = null;
export function infoIcon(text, label) {
  const btn = h('button', { class: 'info-btn', type: 'button', 'aria-label': label ? 'About ' + label : 'What is this' }, icon('info', 15));
  const pop = h('div', { class: 'info-pop', role: 'tooltip' }, h('p', { text }));
  const wrap = h('span', { class: 'info-wrap' }, btn, pop);
  const close = () => { wrap.classList.remove('open'); document.removeEventListener('mousedown', onOutside); document.removeEventListener('keydown', onKey); if (openInfo === close) openInfo = null; };
  const onOutside = e => { if (!wrap.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape') { close(); btn.focus(); } };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (wrap.classList.contains('open')) { close(); return; }
    if (openInfo) openInfo();
    wrap.classList.add('open');
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    openInfo = close;
  });
  return wrap;
}
