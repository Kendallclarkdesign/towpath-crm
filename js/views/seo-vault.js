import { h, icon, pill, field, input, select, textarea, drawer, confirmBox, toast, empty } from '../ui.js';
import { store } from '../store.js';
import { SEO_CATEGORIES, SEO_ACCURACY_TONE, SEO_ROUTING } from '../model.js';

const ui = { q: '', category: 'all', accuracy: 'all', routing: 'all' };
const routingTone = id => (SEO_ROUTING.find(r => r.id === id) || {}).tone || 'neutral';
const EFFORT_IMPACT = [['Low', 'Low'], ['Medium', 'Medium'], ['High', 'High']];

export function mount(root, { args }) {
  let ctl = null, openId = null;

  const page = h('div', { class: 'page' });
  const results = h('div', { class: 'results' });
  const summary = h('p', { class: 'muted small', 'aria-live': 'polite' });

  const search = input({ id: 'sv-q', type: 'search', placeholder: 'Search tips, creators, services', 'aria-label': 'Search the vault', value: ui.q });
  search.addEventListener('input', () => { ui.q = search.value; renderResults(); });
  const catSel = select([['all', 'All categories'], ...SEO_CATEGORIES.map(c => [c, c])], ui.category, { 'aria-label': 'Filter by category' });
  catSel.addEventListener('change', () => { ui.category = catSel.value; renderResults(); });
  const accSel = select([['all', 'Any accuracy'], ...Object.keys(SEO_ACCURACY_TONE).map(a => [a, a])], ui.accuracy, { 'aria-label': 'Filter by accuracy' });
  accSel.addEventListener('change', () => { ui.accuracy = accSel.value; renderResults(); });
  const routeSel = select([['all', 'Any routing'], ...SEO_ROUTING.map(r => [r.id, r.id])], ui.routing, { 'aria-label': 'Filter by routing' });
  routeSel.addEventListener('change', () => { ui.routing = routeSel.value; renderResults(); });

  page.append(
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'SEO Vault' }), h('h1', { text: 'Tips from the field' }),
        h('p', { class: 'muted', text: 'Every SEO tip the pipeline has pulled from Instagram videos, checked for accuracy and routed to a use. Run tools/seo_vault_pipeline.py on a folder of downloaded videos to add more, or add one by hand.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: addTip }, icon('plus', 16), 'Add tip'))),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 16), search), catSel, accSel, routeSel),
    summary, results);
  root.append(page);

  /* ---------- results ---------- */
  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return store.list('seo_vault')
      .filter(t => (ui.category === 'all' || t.category === ui.category) && (ui.accuracy === 'all' || t.accuracy === ui.accuracy) && (ui.routing === 'all' || t.routing === ui.routing)
        && (!q || [t.tip, t.creator, t.towpathService].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function renderResults() {
    const rows = filtered();
    summary.textContent = rows.length + (rows.length === 1 ? ' tip' : ' tips');
    results.replaceChildren(rows.length
      ? h('div', { class: 'cards' }, rows.map(t => h('div', { class: 'card' },
          h('button', { class: 'card-open', type: 'button', onclick: () => openTip(t.id) },
            h('strong', { text: t.tip }), h('span', { class: 'muted small', text: (t.creator || 'Unknown') + (t.category ? ' · ' + t.category : '') })),
          h('div', { class: 'card-foot' }, pill(t.accuracy || 'Unverified', SEO_ACCURACY_TONE[t.accuracy] || 'neutral'), pill(t.routing || 'Skip', routingTone(t.routing))))))
      : empty('No tips yet. Run the pipeline on a folder of videos, or add one by hand.', h('button', { class: 'btn primary', type: 'button', onclick: addTip }, 'Add your first tip')));
    if (ctl && ctl.body.isConnected && openId && store.get('seo_vault', openId)) renderTip(openId);
  }

  /* ---------- detail ---------- */
  function openTip(id) {
    const t = store.get('seo_vault', id);
    if (!t) return;
    openId = id;
    ctl = drawer(t.tip);
    renderTip(id);
  }

  function renderTip(id) {
    const t = store.get('seo_vault', id);
    if (!t) return;
    ctl.setTitle(t.tip);
    const b = ctl.body; b.replaceChildren();
    const routeSel2 = select(SEO_ROUTING.map(r => [r.id, r.id]), t.routing, { 'aria-label': 'Routing' });
    routeSel2.addEventListener('change', () => { store.put('seo_vault', { ...store.get('seo_vault', id), routing: routeSel2.value }); toast('Routing updated'); });

    b.append(
      h('div', { class: 'pills' }, pill(t.category || 'Uncategorized', 'neutral'), pill(t.accuracy || 'Unverified', SEO_ACCURACY_TONE[t.accuracy] || 'neutral')),
      h('p', { class: 'muted', text: [t.creator || 'Unknown creator', t.sourceFile].filter(Boolean).join(' · ') }),

      section('Why', h('p', { text: t.accuracyReason || 'Not recorded.' })),
      section('Applies to', h('p', { text: t.towpathService || 'Not recorded.' })),
      section('How to do it', t.steps
        ? h('ol', { class: 'bullets pad' }, String(t.steps).split('|').map(s => s.trim()).filter(Boolean).map(s => h('li', { text: s })))
        : h('p', { class: 'muted', text: 'Not recorded.' })),
      section('Effort / impact', h('div', { class: 'pills' }, pill('Effort: ' + (t.effort || '?'), 'neutral'), pill('Impact: ' + (t.impact || '?'), 'neutral'))),
      section('Routing', routeSel2),
      section('Manage',
        h('button', { class: 'btn small danger-outline', type: 'button', onclick: async () => {
          if (await confirmBox({ title: 'Delete this tip?', lines: [t.tip], confirmText: 'Delete tip', danger: true })) {
            store.del('seo_vault', id); ctl.close(); toast('Tip deleted');
          }
        } }, icon('trash', 14), 'Delete tip')));
  }

  /* ---------- add by hand ---------- */
  function addTip() {
    openId = null;
    ctl = drawer('Add tip');
    const f = {
      tip: input({ required: true }), creator: input({}),
      category: select(SEO_CATEGORIES.map(c => [c, c]), SEO_CATEGORIES[0]),
      accuracy: select(Object.keys(SEO_ACCURACY_TONE).map(a => [a, a]), 'Unverified'),
      reason: textarea({ rows: 2 }, ''), service: input({}),
      steps: textarea({ rows: 3, placeholder: 'One step per line' }, ''),
      effort: select(EFFORT_IMPACT, 'Medium'), impact: select(EFFORT_IMPACT, 'Medium'),
      routing: select(SEO_ROUTING.map(r => [r.id, r.id]), SEO_ROUTING[0].id)
    };
    const err = h('p', { class: 'form-error', role: 'alert' });
    ctl.body.append(h('form', { class: 'form', onsubmit: e => {
      e.preventDefault();
      if (!f.tip.value.trim()) { err.textContent = 'Add the tip itself.'; f.tip.focus(); return; }
      const t = store.put('seo_vault', {
        tip: f.tip.value.trim(), creator: f.creator.value.trim() || 'Unknown', category: f.category.value,
        accuracy: f.accuracy.value, accuracyReason: f.reason.value.trim(), towpathService: f.service.value.trim(),
        steps: f.steps.value.split('\n').map(s => s.trim()).filter(Boolean).join(' | '),
        effort: f.effort.value, impact: f.impact.value, routing: f.routing.value,
        sourceFile: '', createdAt: new Date().toISOString()
      });
      store.log('Added SEO tip: ' + t.tip);
      ctl.close(); toast('Tip added'); openTip(t.id);
    } },
      field('Tip', f.tip), field('Creator', f.creator), field('Category', f.category), field('Accuracy', f.accuracy),
      field('Why', f.reason), field('Applies to', f.service), field('Steps', f.steps, 'One step per line'),
      field('Effort', f.effort), field('Impact', f.impact), field('Routing', f.routing),
      err, h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Add tip' }))));
    f.tip.focus();
  }

  const section = (title, ...kids) => h('section', { class: 'dsec' }, h('h3', { text: title }), ...kids);

  renderResults();
  const off = store.sub(c => { if (c === 'seo_vault' || c === '*') renderResults(); });
  if (args[0]) openTip(args[0]);
  return off;
}
