import { h, icon, fmt, pill, field, input, select, textarea, drawer, confirmBox, toast, empty, panel, avatar, infoIcon, startOfDay, toDate } from '../ui.js';
import { store, MODE } from '../store.js';
import * as remote from '../remote.js';
import { resolvedReportHTML, timeReportHTML, openPrintable } from '../report.js';
import { toolLinks } from '../model.js';
import { scheduleMeeting } from './calendar.js';

const ui = { tab: 'overview' };
const TABS = [['overview', 'Overview'], ['analytics', 'Analytics'], ['work', 'Work log'], ['time', 'Time'], ['notes', 'Notes']];
const SEV = { high: ['High', 'danger'], med: ['Medium', 'gold'], low: ['Low', 'neutral'] };
const SEV_ORDER = { high: 0, med: 1, low: 2 };
const CONN = { connected: ['Connected per notes', 'good'], 'set-up': ['Set up', 'good'], risk: ['At risk', 'danger'], none: ['Not connected', 'neutral'] };

export function mount(root, { args, query }) {
  if (TABS.some(([id]) => id === query.get('tab'))) ui.tab = query.get('tab');
  const page = h('div', { class: 'page' });
  root.append(page);
  const render = () => {
    stopClock();
    const c = args[0] && store.get('clients', args[0]);
    page.replaceChildren(...(c ? profile(c) : listView()));
  };
  const off = store.sub(c => { if (c === 'clients' || c === 'activity' || c === 'time_entries' || c === 'gsc_snapshots' || c === '*') render(); });
  render();
  return () => { stopClock(); off(); };
}

/* ---------- list ---------- */
const openCount = c => (c.items || []).filter(i => i.state === 'open').length;
const daysSince = d => Math.max(0, Math.round((startOfDay(new Date()) - startOfDay(toDate(d))) / 864e5));

function listView() {
  const clients = store.list('clients');
  return [
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'Clients' }), h('h1', { text: 'Client profiles' }),
        h('p', { class: 'muted', text: 'Everything about one client lives here: contact info, brand, findings you have opened and resolved, a work log, time you have clocked, and your private notes. Open a client to see all of it, or add a new one.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: addClient }, icon('plus', 16), 'Add client'))),
    clients.length ? h('div', { class: 'cards' }, clients.map(c => {
      const items = c.items || [], done = items.filter(i => i.state === 'done').length, high = items.filter(i => i.state === 'open' && i.sev === 'high').length;
      return h('a', { class: 'client-card', href: '#/clients/' + c.id },
        h('div', { class: 'cc-top' }, avatar(c.name, 'green'), h('div', { class: 'grow' }, h('strong', { text: c.name }), h('span', { class: 'muted small block', text: c.industry })), pill(c.status, c.tone)),
        h('p', { class: 'muted small', text: c.location }),
        h('div', { class: 'meter', 'aria-label': done + ' of ' + items.length + ' items resolved' }, h('span', { style: 'width:' + (items.length ? done / items.length * 100 : 0) + '%' })),
        h('div', { class: 'cc-foot' },
          h('span', { class: 'small', text: openCount(c) + ' open' + (high ? ', ' + high + ' high' : '') }),
          h('span', { class: 'muted small', text: c.lastTouch ? 'Last touch ' + daysSince(c.lastTouch) + ' days ago' : '' })));
    })) : empty('No clients yet.', h('button', { class: 'btn primary', type: 'button', onclick: addClient }, 'Add your first client'))
  ];
}

function addClient() {
  const ctl = drawer('Add client');
  const f = { name: input({ required: true }), owner: input({}), industry: input({}), location: input({}), email: input({ type: 'email' }), phone: input({ type: 'tel' }), website: input({ type: 'url', placeholder: 'https://' }),
    status: select(['Active', 'In progress', 'Concept review', 'Paused'], 'Active') };
  const err = h('p', { class: 'form-error', role: 'alert' });
  ctl.body.append(h('form', { class: 'form', onsubmit: e => {
    e.preventDefault();
    if (!f.name.value.trim()) { err.textContent = 'A client needs a name.'; return; }
    const c = store.put('clients', { name: f.name.value.trim(), legal: '', owner: f.owner.value.trim() || 'UNKNOWN', industry: f.industry.value.trim(), location: f.location.value.trim() || 'UNKNOWN',
      status: f.status.value, tone: 'gold', email: f.email.value.trim() || 'UNKNOWN', phone: f.phone.value.trim() || 'UNKNOWN', website: f.website.value.trim(),
      brand: null, facts: [], stack: '', lastTouch: new Date().toISOString().slice(0, 10), analytics: { score: null, rating: null, connections: [] }, items: [], work: [], tools: [], notes: '' });
    store.log('Added client ' + c.name, 'client:' + c.id);
    ctl.close(); location.hash = '#/clients/' + c.id;
  } },
    field('Business name', f.name), field('Owner', f.owner), field('Industry', f.industry), field('Location', f.location),
    field('Email', f.email), field('Phone', f.phone), field('Website', f.website), field('Status', f.status), err,
    h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Add client' }))));
  f.name.focus();
}

/* ---------- profile ---------- */
function profile(c) {
  const head = h('div', { class: 'profile-head' },
    h('a', { class: 'back', href: '#/clients' }, icon('chevL', 16), 'All clients'),
    h('div', { class: 'ph-main' },
      avatar(c.name, 'green'),
      h('div', { class: 'grow' }, h('h1', { text: c.name }), h('p', { class: 'muted', text: [c.owner !== 'UNKNOWN' ? c.owner : null, c.location].filter(Boolean).join(' · ') })),
      pill(c.status, c.tone)),
    h('div', { class: 'actions wrap' },
      h('a', { class: 'btn primary', href: '#/email?client=' + c.id }, icon('mail', 16), 'Email ' + (c.owner && c.owner !== 'UNKNOWN' ? c.owner.split(' ')[0] : 'client')),
      c.website ? h('a', { class: 'btn', href: c.website, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Open site') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => giveTask(c) }, icon('team', 16), 'Give the team a task'),
      h('button', { class: 'btn', type: 'button', onclick: () => scheduleMeeting({ with: 'client:' + c.id, title: 'Meeting with ' + c.name }) }, icon('clock', 16), 'Schedule a meeting'),
      clockControl(c),
      infoIcon('Clock in while you are actively working on ' + c.name + '. Clock out when you stop. Time is saved to the Time tab, where you can also log time by hand and generate a time report.', 'the clock')));

  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Client sections' }, TABS.map(([id, label]) =>
    h('button', { role: 'tab', type: 'button', class: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; render2(); } }, label)));
  const body = h('div', { class: 'tabbody', role: 'tabpanel' });
  const wrap = [head, tabs, body];
  function render2() {
    const fresh = store.get('clients', c.id);
    tabs.querySelectorAll('.tab').forEach((t, i) => t.setAttribute('aria-selected', String(TABS[i][0] === ui.tab)));
    body.replaceChildren(...({ overview, analytics, work, time, notes }[ui.tab])(fresh));
  }
  render2();
  return wrap;
}

const kv = (k, v, href) => h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), href ? h('a', { href, text: v, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener' }) : h('span', { text: v }));

function overview(c) {
  const known = v => v && v !== 'UNKNOWN';
  return [h('div', { class: 'grid-2' },
    panel('Contact', null, h('div', { class: 'pad' },
      kv('Owner', c.owner || 'UNKNOWN'), c.company ? kv('Company', c.company) : null, kv('Email', c.email || 'UNKNOWN', known(c.email) ? '#/email?client=' + c.id : null),
      kv('Phone', c.phone || 'UNKNOWN', known(c.phone) ? 'tel:' + c.phone.replace(/[^\d+]/g, '') : null),
      kv('Website', c.website || 'None yet', c.website || null), kv('Location', c.location || 'UNKNOWN'), c.legal ? kv('Legal name', c.legal) : null)),
    panel('Brand', null, h('div', { class: 'pad' },
      c.brand && c.brand.colors && c.brand.colors.length ? h('div', { class: 'swatches' }, c.brand.colors.map(([n, hex]) => h('div', { class: 'swatch' }, h('span', { style: 'background:' + hex }), h('b', { text: n }), h('code', { text: hex })))) : null,
      c.brand && c.brand.fonts ? kv('Fonts', c.brand.fonts) : null,
      c.brand && c.brand.note ? h('p', { class: 'muted small', text: c.brand.note }) : null,
      !c.brand ? h('p', { class: 'muted', text: 'No brand kit on file.' }) : null))),
  h('div', { class: 'grid-2' },
    panel('Key facts', null, c.facts && c.facts.length ? h('ul', { class: 'bullets pad' }, c.facts.map(f => h('li', { text: f }))) : empty('No facts recorded yet.')),
    panel('How it is built', null, h('div', { class: 'pad' }, h('p', { text: c.stack || 'Not recorded.' })))),
  tools(c)];
}

function tools(c) {
  const links = toolLinks(c);
  return panel('Tools', infoIcon('Straight links to the real tools for this client, no login built in, just where you would already go. Add client-specific ones (a known GA4 property, a Figma file) to their record; Ahrefs, Search Console and PageSpeed are worked out from their website automatically.', 'the tools panel'),
    links.length ? h('div', { class: 'list' }, links.map(t => h('a', { class: 'list-item as-btn', href: t.url, target: '_blank', rel: 'noopener' },
      h('div', { class: 'grow' }, h('strong', { text: t.label })), icon('external', 16)))) : empty('Add a website to this client to get automatic tool links.'));
}

/* ---------- Search Console ---------- */
const nf = n => Math.round(n).toLocaleString('en-US');
function delta(cur, prev, lowerIsBetter) {
  if (!prev) return '';
  const d = cur - prev, pct = Math.abs(d) / prev * 100;
  if (!isFinite(pct) || d === 0) return 'no change vs previous 28 days';
  return (d > 0 ? 'up ' : 'down ') + (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '% vs previous 28 days';
}
function searchPerformance(c) {
  const snap = store.get('gsc_snapshots', c.id);
  const host = (c.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const propIn = input({ placeholder: host ? 'sc-domain:' + host : 'sc-domain:example.com', 'aria-label': 'Search Console property' });
  propIn.value = c.gscProperty || (snap && snap.siteUrl) || '';
  const status = h('span', { class: 'muted small' });
  const run = async btn => {
    const prop = propIn.value.trim();
    if (!prop) { status.textContent = 'Enter the Search Console property first.'; return; }
    btn.disabled = true; status.textContent = 'Pulling from Search Console...';
    try {
      const res = await remote.fn('gsc-sync', { action: 'sync', clientId: c.id, siteUrl: prop });
      store.patch('clients', c.id, { gscProperty: prop });
      store.put('gsc_snapshots', res.snapshot);
      store.log('Pulled Search Console numbers for ' + c.name, 'client:' + c.id);
    } catch (e) { if (!e.signedOut) status.textContent = e.message; btn.disabled = false; }
  };
  const syncBtn = h('button', { class: 'btn small primary', type: 'button', onclick: e => run(e.currentTarget) }, snap ? 'Refresh' : 'Pull numbers');
  const head = h('div', { class: 'actions' }, status, syncBtn,
    infoIcon('Reads your Search Console data through a Google service account kept on the server. The property must list that account as a user. Numbers cover the last 28 days ending 2 days ago, because Search Console lags. Nothing is estimated.', 'search performance'));
  const setup = h('div', { class: 'inline-form' }, propIn);

  if (MODE === 'local') return panel('Search performance', head, empty('Search Console pulls only work on the live CRM, signed in. Local preview has no server to ask.'));
  if (!snap) return panel('Search performance', head, setup, empty('No numbers pulled yet. Enter the property (a domain property looks like sc-domain:example.com) and pull.'));

  const t = snap.totals, p = snap.prevTotals;
  const stat = (label, big, sub) => h('div', { class: 'stat' }, h('span', { class: 'stat-l', text: label }), h('strong', { class: 'stat-n num', text: big }), h('span', { class: 'muted small', text: sub }));
  const max = Math.max(1, ...snap.daily.map(d => d.clicks));
  const bars = h('div', { class: 'gsc-bars', role: 'img', 'aria-label': 'Daily clicks, last 28 days' },
    snap.daily.map(d => h('span', { title: d.date + ': ' + d.clicks + ' clicks', style: 'height:' + Math.max(2, d.clicks / max * 100) + '%' })));
  const table = (rows, label) => rows.length ? h('div', { class: 'list' }, rows.slice(0, 10).map(r => h('div', { class: 'list-item' },
    h('div', { class: 'grow' }, h('strong', { text: label === 'page' ? r.key.replace(/^https?:\/\/[^/]+/, '') || '/' : r.key })),
    h('span', { class: 'muted small num nowrap', text: nf(r.clicks) + ' clicks · ' + nf(r.impressions) + ' impr · pos ' + r.position })))) : empty('No data in this window.');
  return panel('Search performance', head, setup,
    h('div', { class: 'stats' },
      stat('Clicks', nf(t.clicks), delta(t.clicks, p.clicks)),
      stat('Impressions', nf(t.impressions), delta(t.impressions, p.impressions)),
      stat('Click rate', t.ctr + '%', 'was ' + p.ctr + '%'),
      stat('Avg position', String(t.position), p.position ? 'was ' + p.position + ' (lower is better)' : '')),
    bars,
    h('p', { class: 'muted small', text: snap.range.startDate + ' to ' + snap.range.endDate + ', pulled ' + fmt.date(snap.pulledAt) + '.' }),
    panel('Top queries', null, table(snap.queries, 'query')),
    panel('Top pages', null, table(snap.pages, 'page')));
}

function analytics(c) {
  const a = c.analytics || {}, items = c.items || [];
  const open = items.filter(i => i.state === 'open'), done = items.filter(i => i.state === 'done');
  const score = (label, big, sub, pct) => h('div', { class: 'stat' }, h('span', { class: 'stat-l', text: label }), h('strong', { class: 'stat-n num', text: big }), sub ? h('span', { class: 'muted small', text: sub }) : null,
    pct != null ? h('div', { class: 'meter' }, h('span', { style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' })) : null);
  const stats = [];
  stats.push(score('Findings resolved', done.length + ' of ' + items.length, open.length + ' still open', items.length ? done.length / items.length * 100 : 0));
  if (a.score) stats.push(score(a.score.label, a.score.value + ' / ' + a.score.max, a.score.note, a.score.value / a.score.max * 100));
  if (a.rating) stats.push(score(a.rating.label, a.rating.value.toFixed(1) + ' / 5', a.rating.note, a.rating.value / 5 * 100));
  (a.metrics || []).forEach(m => stats.push(score(m.label, m.value, m.note, null)));
  if (c.lastTouch) stats.push(score('Days since last touch', String(daysSince(c.lastTouch)), fmt.date(c.lastTouch), null));

  const toggle = idx => { const next = store.get('clients', c.id).items.map((it, i) => i === idx ? { ...it, state: it.state === 'open' ? 'done' : 'open' } : it); store.patch('clients', c.id, { items: next }); store.log((next[idx].state === 'done' ? 'Resolved: ' : 'Reopened: ') + next[idx].text, 'client:' + c.id); };
  const setBenefit = (idx, val) => { const next = store.get('clients', c.id).items.map((it, i) => i === idx ? { ...it, benefit: val } : it); store.patch('clients', c.id, { items: next }); };
  const row = (it, idx) => {
    const kids = [h('div', { class: 'finding' + (it.state === 'done' ? ' done' : '') },
      pill(SEV[it.sev][0], it.state === 'done' ? 'neutral' : SEV[it.sev][1]),
      h('span', { class: 'grow', text: it.text }),
      h('button', { class: 'btn small', type: 'button', onclick: () => toggle(idx) }, it.state === 'open' ? 'Mark done' : 'Reopen'))];
    if (it.state === 'done') {
      const benefitIn = input({ class: 'benefit-input', placeholder: 'Why this matters to them (optional, shown on the report)', 'aria-label': 'Benefit for ' + it.text });
      benefitIn.value = it.benefit || '';
      benefitIn.addEventListener('change', () => setBenefit(idx, benefitIn.value.trim()));
      kids.push(h('div', { class: 'finding-benefit' }, benefitIn));
    }
    return h('div', { class: 'finding-wrap' }, kids);
  };
  const indexed = items.map((it, idx) => ({ it, idx }));
  const openRows = indexed.filter(x => x.it.state === 'open').sort((a, b) => SEV_ORDER[a.it.sev] - SEV_ORDER[b.it.sev]);
  const doneRows = indexed.filter(x => x.it.state === 'done');

  const sevSel = select([['high', 'High'], ['med', 'Medium'], ['low', 'Low']], 'med', { 'aria-label': 'Severity' });
  const newIn = input({ placeholder: 'Add a finding or to-do for this client', 'aria-label': 'New finding' });
  const addForm = h('form', { class: 'inline-form', onsubmit: e => {
    e.preventDefault();
    if (!newIn.value.trim()) return;
    store.patch('clients', c.id, { items: [...(store.get('clients', c.id).items || []), { sev: sevSel.value, state: 'open', text: newIn.value.trim() }] });
    store.log('Added a finding for ' + c.name, 'client:' + c.id);
  } }, newIn, sevSel, h('button', { class: 'btn small primary', type: 'submit', text: 'Add' }));

  const conns = a.connections || [];
  const resolvedHead = h('div', { class: 'actions' },
    h('span', { class: 'muted small', text: doneRows.length + ' done' }),
    h('button', { class: 'btn small', type: 'button', disabled: !doneRows.length, onclick: () => generateResolvedReport(c, doneRows.map(x => x.it)) }, icon('doc', 14), 'Generate report'),
    infoIcon('Turns every resolved item below into a client-ready document, priority, issue, and why it matters if you filled that in, opened in a new tab ready to print or save as a PDF.', 'the report button'));
  return [
    h('div', { class: 'stats' }, stats),
    searchPerformance(c),
    h('div', { class: 'callout' }, h('p', { text: 'The score and findings above come from your own audits and notes. Search numbers come straight from Search Console when pulled. GA4 is not connected yet. Nothing here is estimated.' })),
    panel('Data connections', null, conns.length ? h('div', { class: 'list' }, conns.map(x => h('div', { class: 'list-item' },
      h('div', { class: 'grow' }, h('strong', { text: x.name }), h('span', { class: 'muted small block', text: x.note })), pill(CONN[x.state][0], CONN[x.state][1]))))
      : empty('No data sources connected for this client yet.')),
    panel('Open findings',
      h('div', { class: 'actions' }, h('span', { class: 'muted small', text: openRows.length + ' open' }), infoIcon('High, Medium and Low reflect real risk: High touches safety or trust, Medium is a real gap in what the site shows, Low is cleanup work. Mark something done once it is actually live and checked, not just planned.', 'priority')),
      openRows.length ? h('div', { class: 'list' }, openRows.map(x => row(x.it, x.idx))) : empty('Nothing open.'), addForm),
    doneRows.length ? panel('Resolved', resolvedHead, h('div', { class: 'list' }, doneRows.map(x => row(x.it, x.idx)))) : null
  ];
}

function work(c) {
  const rows = (c.work || []).slice().sort((a, b) => b[0].localeCompare(a[0]));
  return [panel('Work log', null, rows.length ? h('ol', { class: 'timeline' }, rows.map(([d, t]) => h('li', null, h('time', { class: 'num', text: fmt.date(d + 'T12:00:00') }), h('span', { text: t })))) : empty('Nothing logged yet.'))];
}

/* ---------- time ---------- */
const runningEntry = () => store.list('time_entries').find(e => !e.endedAt);
let clockTimer = null;
function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

function clockIn(c) {
  const start = () => { store.put('time_entries', { clientId: c.id, startedAt: new Date().toISOString(), endedAt: null, note: '' }); store.log('Clocked in on ' + c.name, 'client:' + c.id); };
  const r = runningEntry();
  if (!r) { start(); return; }
  if (r.clientId === c.id) return;
  const other = store.get('clients', r.clientId);
  confirmBox({ title: 'Switch the clock?', lines: ['You are still clocked in on ' + (other ? other.name : 'another client') + '.', 'Clock out there and clock in on ' + c.name + ' instead?'], confirmText: 'Switch' })
    .then(ok => { if (!ok) return; clockOut(r); start(); });
}
function clockOut(entry) {
  store.patch('time_entries', entry.id, { endedAt: new Date().toISOString() });
  const c = store.get('clients', entry.clientId);
  store.log('Clocked out' + (c ? ' on ' + c.name : ''), entry.clientId ? 'client:' + entry.clientId : '');
}
function clockControl(c) {
  const r = runningEntry();
  if (!r || r.clientId !== c.id) {
    return h('button', { class: 'btn', type: 'button', onclick: () => clockIn(c) }, icon('clock', 16), r ? 'Switch clock here' : 'Clock in');
  }
  const timeEl = h('span', { class: 'num' });
  const paint = () => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(r.startedAt).getTime()) / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    timeEl.textContent = hh + ':' + mm + ':' + ss;
  };
  paint();
  stopClock();
  clockTimer = setInterval(paint, 1000);
  return h('button', { class: 'btn clock-btn running', type: 'button', onclick: () => clockOut(r) }, h('span', { class: 'clock-dot' }), 'Clock out · ', timeEl);
}

const hrsOf = e => (new Date(e.endedAt) - new Date(e.startedAt)) / 3600000;
const fmtHrs = h => (Math.round(h * 100) / 100).toString();

function generateResolvedReport(c, doneItems) {
  if (!openPrintable(resolvedReportHTML(c, doneItems))) toast('Your browser blocked the new tab. Allow popups for this site and try again.');
}
function generateTimeReport(c, entries) {
  if (!openPrintable(timeReportHTML(c, entries))) toast('Your browser blocked the new tab. Allow popups for this site and try again.');
}

function time(c) {
  const all = store.list('time_entries').filter(e => e.clientId === c.id);
  const closed = all.filter(e => e.endedAt).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const now = new Date();
  const thisMonth = closed.filter(e => { const d = new Date(e.startedAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const sum = arr => arr.reduce((s, e) => s + hrsOf(e), 0);

  const stat = (label, big) => h('div', { class: 'stat' }, h('span', { class: 'stat-l', text: label }), h('strong', { class: 'stat-n num', text: big }));
  const row = e => h('div', { class: 'time-entry' },
    h('span', { class: 'when muted small', text: fmt.date(e.startedAt) }),
    h('span', { class: 'grow', text: e.note || 'No note' }),
    h('span', { class: 'dur', text: fmtHrs(hrsOf(e)) + ' hrs' }),
    h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Delete this time entry', onclick: async () => { if (await confirmBox({ title: 'Delete this time entry?', lines: [fmt.date(e.startedAt) + ', ' + fmtHrs(hrsOf(e)) + ' hours'], confirmText: 'Delete', danger: true })) store.del('time_entries', e.id); } }, icon('trash', 14)));

  const dateIn = input({ type: 'date', 'aria-label': 'Date' }); dateIn.value = new Date().toISOString().slice(0, 10);
  const hrsIn = input({ type: 'number', step: '0.25', min: '0.25', placeholder: 'Hours', 'aria-label': 'Hours' });
  const noteIn = input({ placeholder: 'What did you work on? (optional)', 'aria-label': 'Note' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const addForm = h('form', { class: 'inline-form', onsubmit: e => {
    e.preventDefault();
    const hrs = parseFloat(hrsIn.value);
    if (!dateIn.value || !hrs || hrs <= 0) { err.textContent = 'Enter a date and a number of hours.'; return; }
    err.textContent = '';
    const start = new Date(dateIn.value + 'T09:00:00');
    store.put('time_entries', { clientId: c.id, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + hrs * 3600000).toISOString(), note: noteIn.value.trim() });
    store.log('Logged ' + fmtHrs(hrs) + ' hours for ' + c.name, 'client:' + c.id);
    hrsIn.value = ''; noteIn.value = '';
  } }, dateIn, hrsIn, noteIn, h('button', { class: 'btn small primary', type: 'submit', text: 'Add time' }), err);

  return [
    h('div', { class: 'stats' }, stat('Hours this month', fmtHrs(sum(thisMonth))), stat('Hours all time', fmtHrs(sum(closed)))),
    h('div', { class: 'callout' }, h('p', { text: 'Clock in from the button at the top of this page while you work, or add time by hand below for anything you did not clock live.' })),
    panel('Time logged',
      h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', disabled: !closed.length, onclick: () => generateTimeReport(c, closed) }, icon('doc', 14), 'Generate time report'),
        infoIcon('Lists every logged entry for ' + c.name + ' with a total, opened in a new tab ready to print or save as a PDF, useful for invoicing.', 'time report')),
      closed.length ? h('div', { class: 'list' }, closed.map(row)) : empty('No time logged yet.'), addForm)
  ];
}

function notes(c) {
  const ta = textarea({ rows: 6, 'aria-label': 'Client notes', placeholder: 'What you never want to forget about this client' }, c.notes);
  ta.addEventListener('change', () => { store.patch('clients', c.id, { notes: ta.value }); toast('Notes saved'); });
  const acts = store.list('activity').filter(a => a.ref === 'client:' + c.id).sort((a, b) => new Date(b.at) - new Date(a.at));
  return [
    panel('Notes', null, h('div', { class: 'pad' }, ta)),
    panel('Activity', null, acts.length ? h('div', { class: 'list' }, acts.map(a => h('div', { class: 'list-item' }, h('span', { class: 'dot' }), h('div', { class: 'grow', text: a.text }), h('span', { class: 'muted small nowrap', text: fmt.ago(a.at) })))) : empty('Nothing yet.'))
  ];
}

function giveTask(c) {
  const ctl = drawer('Give the team a task');
  const agents = store.list('agents').filter(a => !a.human);
  const who = select(agents.map(a => [a.id, a.title]), 'hcs');
  const title = input({ placeholder: 'What should they do?' });
  const details = textarea({ rows: 4 }, '');
  const err = h('p', { class: 'form-error', role: 'alert' });
  ctl.body.append(h('form', { class: 'form', onsubmit: e => {
    e.preventDefault();
    if (!title.value.trim()) { err.textContent = 'Say what the task is.'; return; }
    store.put('agent_tasks', { agentId: who.value, clientId: c.id, title: title.value.trim(), details: details.value.trim(), status: 'backlog', priority: 'normal', createdAt: new Date().toISOString() });
    store.log('Added a task for ' + c.name + ': ' + title.value.trim(), 'client:' + c.id);
    ctl.close(); toast('Added to the team backlog');
  } },
    h('p', { class: 'muted', text: 'For ' + c.name + '. It waits in the backlog until you queue it from the Team tab.' }),
    field('Who', who), field('Task', title), field('Details', details), err,
    h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Add to backlog' }))));
  title.focus();
}
