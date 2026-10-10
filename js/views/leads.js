import { h, icon, fmt, pill, field, input, select, textarea, drawer, confirmBox, toast, empty, panel, infoIcon } from '../ui.js';
import { store } from '../store.js';
import { STAGES, stageOf, WEB, CADENCE, nextFollowUp } from '../model.js';
import { scheduleMeeting } from './calendar.js';

const ui = { q: '', stage: 'all', town: 'all', email: 'all', view: 'list' };
const ORDER = ['interested', 'outreach', 'drafted', 'verified', 'research', 'won', 'declined'];
const stageTone = id => stageOf(id).tone;

export function mount(root, { args, query }) {
  if (query.get('stage')) ui.stage = query.get('stage');
  let ctl = null, openId = null;

  const page = h('div', { class: 'page' });
  const results = h('div', { class: 'results' });
  const summary = h('p', { class: 'muted small', 'aria-live': 'polite' });

  const search = input({ id: 'lead-q', type: 'search', placeholder: 'Search name, town, phone', 'aria-label': 'Search leads', value: ui.q });
  search.addEventListener('input', () => { ui.q = search.value; renderResults(); });
  const stageSel = select([['all', 'All stages'], ...STAGES.map(s => [s.id, s.label])], ui.stage, { 'aria-label': 'Filter by stage' });
  stageSel.addEventListener('change', () => { ui.stage = stageSel.value; renderResults(); });
  const towns = [...new Set(store.list('leads').map(l => l.town).filter(Boolean))].sort();
  const townSel = select([['all', 'All towns'], ...towns.map(t => [t, t])], ui.town, { 'aria-label': 'Filter by town' });
  townSel.addEventListener('change', () => { ui.town = townSel.value; renderResults(); });
  const emailSel = select([['all', 'Email: any'], ['has', 'Has an email'], ['none', 'No email']], ui.email, { 'aria-label': 'Filter by email' });
  emailSel.addEventListener('change', () => { ui.email = emailSel.value; renderResults(); });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' });
  const drawSeg = () => seg.replaceChildren(
    h('button', { type: 'button', 'aria-pressed': String(ui.view === 'list'), onclick: () => { ui.view = 'list'; drawSeg(); renderResults(); } }, icon('list', 16), 'List'),
    h('button', { type: 'button', 'aria-pressed': String(ui.view === 'board'), onclick: () => { ui.view = 'board'; drawSeg(); renderResults(); } }, icon('board', 16), 'Pipeline'));
  drawSeg();

  page.append(
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'Leads' }), h('h1', { text: 'Pipeline' }),
        h('p', { class: 'muted', text: 'Every lead your team has found, from first research through won or declined. Search or filter below, click one to see what was found and manage it, or switch to Pipeline to see the whole board at once.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => addLead() }, icon('plus', 16), 'Add lead'))),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 16), search), stageSel, townSel, emailSel, seg),
    summary, results);
  root.append(page);

  /* ---------- results ---------- */
  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return store.list('leads')
      .filter(l => (ui.stage === 'all' || l.stage === ui.stage) && (ui.town === 'all' || l.town === ui.town)
        && (ui.email === 'all' || (ui.email === 'has' ? !!l.email : !l.email))
        && (!q || [l.name, l.category, l.town, l.phone, l.email].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || a.name.localeCompare(b.name));
  }
  function renderResults() {
    const rows = filtered();
    summary.textContent = rows.length + (rows.length === 1 ? ' lead' : ' leads');
    results.replaceChildren(ui.view === 'board' ? board(rows) : list(rows));
    if (ctl && ctl.body.isConnected && openId && store.get('leads', openId)) renderLead(openId);
  }

  function list(rows) {
    if (!rows.length) return empty('No leads match. Clear a filter or add one.');
    return h('div', { class: 'lead-list' },
      h('div', { class: 'lead-row head', 'aria-hidden': 'true' }, h('span', { text: 'Business' }), h('span', { text: 'Town' }), h('span', { text: 'Web status' }), h('span', { text: 'Phone' }), h('span', { text: 'Stage' })),
      rows.map(l => h('div', { class: 'lead-row' },
        h('button', { class: 'lr-open', type: 'button', onclick: () => openLead(l.id) },
          h('strong', { text: l.name }), h('span', { class: 'muted small', text: l.category })),
        h('span', { class: 'lr-town', text: l.town }),
        pill(WEB[l.webStatus] || l.webStatus, 'neutral'),
        l.phone ? h('a', { class: 'tel num', href: 'tel:' + l.phone.replace(/[^\d+]/g, ''), 'aria-label': 'Call ' + l.name }, icon('phone', 14), l.phone) : h('span', { class: 'muted small', text: 'No phone' }),
        pill(stageOf(l.stage).label, stageTone(l.stage)))));
  }

  function board(rows) {
    const cols = STAGES.filter(s => s.id !== 'declined' || rows.some(l => l.stage === 'declined'));
    return h('div', { class: 'board' }, cols.map((s, i) => {
      const items = rows.filter(l => l.stage === s.id);
      return h('section', { class: 'board-col', 'aria-label': s.label },
        h('header', null, h('h3', { text: s.label }), h('span', { class: 'count num', text: items.length })),
        items.length ? items.map(l => h('article', { class: 'card' },
          h('button', { class: 'card-open', type: 'button', onclick: () => openLead(l.id) }, h('strong', { text: l.name }), h('span', { class: 'muted small', text: l.town })),
          h('div', { class: 'card-foot' }, pill(WEB[l.webStatus] || l.webStatus, 'neutral'),
            h('span', { class: 'card-moves' },
              i > 0 && s.id !== 'declined' ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Move ' + l.name + ' back', onclick: () => setStage(l, STAGES[i - 1].id) }, icon('chevL', 14)) : null,
              i < 5 && s.id !== 'declined' ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Move ' + l.name + ' forward', onclick: () => setStage(l, STAGES[i + 1].id) }, icon('chevR', 14)) : null))))
          : h('p', { class: 'muted small pad', text: 'Empty' }));
    }));
  }

  /* ---------- actions ---------- */
  function setStage(l, stage) {
    const first = stage === 'outreach' && !l.contactedAt;
    store.put('leads', { ...l, stage, contactedAt: first ? new Date().toISOString() : l.contactedAt, followups: first ? 0 : l.followups });
    store.log(l.name + ' moved to ' + stageOf(stage).label, 'lead:' + l.id);
  }

  function openLead(id) {
    const l = store.get('leads', id);
    if (!l) return;
    openId = id;
    ctl = drawer(l.name);
    renderLead(id);
  }

  function renderLead(id) {
    const l = store.get('leads', id);
    if (!l) return;
    ctl.setTitle(l.name);
    const b = ctl.body; b.replaceChildren();
    const fu = nextFollowUp(l);
    const agents = store.list('agents').filter(a => !a.human);
    const suggest = !l.verified ? 'lv' : (l.stage === 'research' || l.stage === 'verified') ? 'oc' : 'hbd';
    const agentSel = select(agents.map(a => [a.id, a.title]), suggest, { 'aria-label': 'Assign to' });
    const taskIn = input({ value: (!l.verified ? 'Verify ' : 'Work ') + l.name, 'aria-label': 'Task' });
    const notes = textarea({ rows: 3, placeholder: 'Notes from calls and emails', 'aria-label': 'Notes' }, l.notes);
    notes.addEventListener('change', () => { store.put('leads', { ...store.get('leads', id), notes: notes.value }); toast('Notes saved'); });
    const stageSel = select(STAGES.map(s => [s.id, s.label]), l.stage, { 'aria-label': 'Stage' });
    stageSel.addEventListener('change', () => setStage(store.get('leads', id), stageSel.value));

    b.append(
      h('div', { class: 'pills' }, pill(stageOf(l.stage).label, stageTone(l.stage)), l.verified ? pill('Verified', 'good') : pill('Not yet verified', 'gold'), pill(WEB[l.webStatus] || l.webStatus, 'neutral')),
      h('p', { class: 'muted', text: [l.category, l.town].filter(Boolean).join(' · ') }),
      h('div', { class: 'actions wrap' },
        l.phone ? h('a', { class: 'btn primary', href: 'tel:' + l.phone.replace(/[^\d+]/g, '') }, icon('phone', 16), l.phone) : null,
        h('a', { class: 'btn', href: '#/email?lead=' + l.id }, icon('mail', 16), 'Open the draft'),
        h('button', { class: 'btn', type: 'button', onclick: () => scheduleMeeting({ with: 'lead:' + l.id, title: 'Meeting with ' + l.name }) }, icon('clock', 16), 'Schedule'),
        h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: 'https://www.google.com/search?q=' + encodeURIComponent(l.name + ' ' + l.town) }, icon('external', 16), 'Look up')),

      section('What we found', h('p', { text: l.observation || 'Nothing recorded yet.' })),
      section('Contact',
        kv('Phone', l.phone || 'None on file'), kv('Email', l.email || 'None found'), kv('Town', l.town || 'UNKNOWN'), kv('Source', l.source === 'routine' ? 'Daily prospecting routine' : l.source === 'manual' ? 'Added by hand' : 'Lead team')),
      l.body ? section('Draft email',
        kv('Subject', l.subject || '(none)'),
        h('pre', { class: 'draft', text: l.body }),
        h('div', { class: 'actions wrap' },
          h('button', { class: 'btn small', type: 'button', onclick: () => copy(l.subject + '\n\n' + l.body) }, icon('copy', 14), 'Copy'),
          h('a', { class: 'btn small', href: '#/email?lead=' + l.id }, icon('mail', 14), 'Edit in Email'))) : null,

      section('Stage', stageSel,
        fu ? h('div', { class: 'callout' },
          h('div', { class: 'actions' },
            h('p', { html: null, text: 'Next follow-up ' + fmt.short(fu) + ' (day ' + CADENCE[l.followups || 0] + '). ' + (l.followups || 0) + ' of ' + CADENCE.length + ' sent.' }),
            infoIcon('Once a lead moves to Outreach, follow-ups are due on day 3, day 7 and day 14 after first contact. After three tries with no reply, stop, per your outreach rules.', 'follow-up cadence')),
          h('button', { class: 'btn small', type: 'button', onclick: () => { store.put('leads', { ...store.get('leads', id), followups: (l.followups || 0) + 1 }); store.log('Follow-up logged for ' + l.name, 'lead:' + l.id); } }, 'Log follow-up sent'))
          : (l.stage === 'outreach' && (l.followups || 0) >= CADENCE.length ? h('p', { class: 'muted small', text: 'All three follow-ups are done. Per your outreach rules, stop here.' }) : null)),
      section('Notes', notes),
      section('Give it to the team',
        field('Who', agentSel), field('Task', taskIn),
        h('button', { class: 'btn small', type: 'button', onclick: () => {
          store.put('agent_tasks', { agentId: agentSel.value, clientId: '', leadId: id, title: taskIn.value.trim() || 'Work ' + l.name, details: l.observation || '', status: 'backlog', priority: 'normal', createdAt: new Date().toISOString() });
          store.log('Added a task for ' + (agents.find(a => a.id === agentSel.value) || {}).title + ': ' + taskIn.value, 'lead:' + id);
          toast('Added to the team backlog');
        } }, 'Add to backlog'),
        h('p', { class: 'hint', text: 'It waits in the backlog until you queue it from the Team tab.' })),
      section('Manage',
        h('div', { class: 'actions wrap' },
          l.stage !== 'declined' ? h('button', { class: 'btn small', type: 'button', onclick: () => setStage(store.get('leads', id), 'declined') }, 'Mark declined') : null,
          h('button', { class: 'btn small danger-outline', type: 'button', onclick: async () => {
            if (await confirmBox({ title: 'Delete this lead?', lines: [l.name + ' and its draft will be removed from the CRM.'], confirmText: 'Delete lead', danger: true })) {
              store.del('leads', id); store.log('Deleted lead ' + l.name); ctl.close(); toast('Lead deleted');
            }
          } }, icon('trash', 14), 'Delete lead'))));
  }

  function addLead() {
    openId = null;
    ctl = drawer('Add lead');
    const f = {
      name: input({ required: true }), category: input({}), town: input({ placeholder: 'Frenchtown NJ' }),
      phone: input({ type: 'tel' }), email: input({ type: 'email' }),
      web: select(Object.entries(WEB), 'none'), obs: textarea({ rows: 3 }, '')
    };
    const err = h('p', { class: 'form-error', role: 'alert' });
    ctl.body.append(h('form', { class: 'form', onsubmit: e => {
      e.preventDefault();
      if (!f.name.value.trim()) { err.textContent = 'A lead needs a business name.'; f.name.focus(); return; }
      const lead = store.put('leads', { name: f.name.value.trim(), category: f.category.value.trim(), town: f.town.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(),
        webStatus: f.web.value, observation: f.obs.value.trim(), verified: false, subject: '', body: '', stage: 'research', source: 'manual', createdAt: new Date().toISOString(), contactedAt: null, followups: 0, notes: '' });
      store.log('Added lead ' + lead.name, 'lead:' + lead.id);
      ctl.close(); toast('Lead added'); openLead(lead.id);
    } },
      field('Business name', f.name), field('Category', f.category), field('Town', f.town), field('Phone', f.phone), field('Email', f.email),
      field('Web status', f.web), field('What you noticed', f.obs, 'What is wrong or missing. Leave UNKNOWN if you have not checked.'),
      err, h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Add lead' }))));
    f.name.focus();
  }

  const section = (title, ...kids) => h('section', { class: 'dsec' }, h('h3', { text: title }), ...kids);
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), h('span', { text: v }));
  const copy = async t => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { toast('Could not copy. Select the text and copy it.'); } };

  renderResults();
  const off = store.sub(c => { if (c === 'leads' || c === '*') renderResults(); });
  if (query.get('new')) addLead(); else if (args[0]) openLead(args[0]);
  return off;
}
