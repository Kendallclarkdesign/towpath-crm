import { h, icon, fmt, pill, field, input, select, textarea, drawer, confirmBox, toast, empty, avatar, infoIcon } from '../ui.js';
import { store, MODE } from '../store.js';
import * as remote from '../remote.js';
import { TASK_STATUS } from '../model.js';
import { wireRequest } from './settings.js';

const ui = { view: 'roster' };

/* Task pickup (a Queued task actually being attempted by a model) is not built yet,
   that is a separate later step. Chat replies are real once a model is set in Settings. */
const CHAT_LIVE = false;
const activeModel = () => { const s = store.get('settings', 'app'); return s && s.provider && s.model ? s : null; };

const agentOf = id => store.get('agents', id);
const tasksFor = id => store.list('agent_tasks').filter(t => t.agentId === id);
const clientName = id => (store.get('clients', id) || {}).name;

function statusOf(a) {
  if (a.human) return ['Approver', 'gold'];
  const t = tasksFor(a.id);
  if (t.some(x => x.status === 'review')) return ['Needs your review', 'gold'];
  if (t.some(x => x.status === 'running')) return ['Working', 'good'];
  const q = t.filter(x => x.status === 'queued').length;
  if (q) return [q + ' queued', ''];
  return ['Available', 'neutral'];
}

export function mount(root, { query }) {
  if (query.get('view')) ui.view = query.get('view');
  const page = h('div', { class: 'page' });
  root.append(page);
  let ctl = null, open = null, tab = 'chat';

  const render = () => {
    page.replaceChildren(...build());
    if (ctl && ctl.body.isConnected && open) paintAgent();
  };
  const off = store.sub(c => { if (['agents', 'agent_tasks', 'messages', 'clients', '*'].includes(c)) render(); });
  render();
  return off;

  function build() {
    const agents = store.list('agents');
    const staff = agents.filter(a => !a.human), depts = new Set(staff.map(a => a.dept));
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Team view' },
      [['roster', 'Roster'], ['org', 'Org chart'], ['queue', 'Task queue']].map(([id, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(ui.view === id), onclick: () => { ui.view = id; render(); } }, label)));
    return [
      h('div', { class: 'page-head' },
        h('div', null, h('p', { class: 'eyebrow', text: 'Team' }), h('h1', { text: 'Your team' }),
          h('p', { class: 'muted', text: staff.length + ' agents across ' + depts.size + ' departments, plus you. Roster shows everyone and their status, Org chart shows who reports to whom, and Task queue is where you hand real work to an agent and approve it when it comes back. Nothing runs until you move a task to Queued.' })),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => newTask() }, icon('plus', 16), 'New task'))),
      h('div', { class: 'toolbar' }, seg),
      ui.view === 'roster' ? roster(agents) : ui.view === 'org' ? org(agents) : queue()
    ];
  }

  /* ---------- roster ---------- */
  function roster(agents) {
    const groups = [];
    agents.forEach(a => { let g = groups.find(x => x.dept === a.dept); if (!g) groups.push(g = { dept: a.dept, list: [] }); g.list.push(a); });
    return h('div', { class: 'depts' }, groups.map(g => {
      const head = g.list.find(a => !a.reportsTo || a.reportsTo === 'coo' || a.reportsTo === 'kendall') || g.list[0];
      return h('section', { class: 'dept' + (g.list.length > 2 ? ' wide' : '') },
        h('header', { class: 'dept-head' }, h('h2', { text: g.dept }), h('span', { class: 'muted small', text: g.list.length + (g.list.length === 1 ? ' person' : ' people') }),
          !head.human ? h('button', { class: 'btn small', type: 'button', onclick: () => openAgent(head.id, 'chat') }, icon('chat', 14), 'Message team') : null),
        h('div', { class: 'people' }, g.list.map(personCard)));
    }));
  }
  function personCard(a) {
    const [st, tone] = statusOf(a);
    return h('button', { class: 'person', type: 'button', onclick: () => openAgent(a.id, a.human ? 'profile' : 'chat') },
      h('div', { class: 'person-top' }, avatar(a.human ? a.name : a.title, a.human ? 'gold' : 'green', a.abbr), h('div', { class: 'grow' }, h('strong', { text: a.title }), h('span', { class: 'muted small block', text: a.human ? a.name : (a.reportsTo ? 'Reports to ' + (agentOf(a.reportsTo) || {}).title : '') }))),
      h('p', { class: 'muted small clamp3', text: a.blurb }),
      h('div', { class: 'person-foot' }, pill(st, tone), h('span', { class: 'muted small', text: (a.skills || []).slice(0, 2).join(' · ') })));
  }

  /* ---------- org chart ---------- */
  function org(agents) {
    const kids = id => agents.filter(a => a.reportsTo === id);
    const node = a => h('li', null,
      h('button', { class: 'org-node', type: 'button', onclick: () => openAgent(a.id, a.human ? 'profile' : 'chat') },
        avatar(a.human ? a.name : a.title, a.human ? 'gold' : 'green', a.abbr), h('span', null, h('strong', { text: a.title }), h('span', { class: 'muted small block', text: a.human ? a.name : a.dept }))),
      kids(a.id).length ? h('ul', null, kids(a.id).map(node)) : null);
    const roots = agents.filter(a => !a.reportsTo);
    return h('div', { class: 'org' }, h('ul', { class: 'org-root' }, roots.map(node)));
  }

  /* ---------- task queue ---------- */
  function queue() {
    const tasks = store.list('agent_tasks');
    return h('div', null,
      h('div', { class: 'callout' },
        h('div', { class: 'actions' },
          h('p', { text: 'Move a task to Queued when you want the real agent to do it. Nothing runs on its own. Queued tasks are picked up in a Claude Code session, and finished work comes back here as Needs review for your approval.' }),
          infoIcon('Backlog is not yet ready to run. Queued means you have asked for it to run. Running means an agent picked it up in Claude Code. Needs review means it is done and waiting on your approval. Done means you have approved it. Use the arrows on a task card to move it, or delete it with the trash icon.', 'the task queue')),
        CHAT_LIVE ? null : h('p', { class: 'muted small', text: 'Pickup connects when the CRM database goes live. Until then the queue is your own tracker.' })),
      h('div', { class: 'board' }, TASK_STATUS.map(s => {
        const items = tasks.filter(t => t.status === s.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return h('section', { class: 'board-col', 'aria-label': s.label }, h('header', null, h('h3', { text: s.label }), h('span', { class: 'count num', text: items.length })),
          items.length ? items.map(t => taskCard(t, true)) : h('p', { class: 'muted small pad', text: 'Empty' }));
      })));
  }

  function taskCard(t, showAgent) {
    const a = agentOf(t.agentId), i = TASK_STATUS.findIndex(s => s.id === t.status);
    return h('article', { class: 'card task' },
      h('strong', { text: t.title }),
      t.details ? h('p', { class: 'muted small clamp3', text: t.details }) : null,
      h('div', { class: 'pills' }, showAgent && a ? pill(a.title, 'neutral') : null, t.clientId && clientName(t.clientId) ? pill(clientName(t.clientId)) : null, t.priority === 'high' ? pill('High', 'danger') : null),
      h('div', { class: 'card-foot' },
        pill((TASK_STATUS[i] || {}).label || t.status, t.status === 'review' ? 'gold' : t.status === 'done' ? 'good' : 'neutral'),
        h('span', { class: 'card-moves' },
          i > 0 ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Move back', onclick: () => move(t, -1) }, icon('chevL', 14)) : null,
          i < TASK_STATUS.length - 1 ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Move forward', onclick: () => move(t, 1) }, icon('chevR', 14)) : null,
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Delete task', onclick: async () => { if (await confirmBox({ title: 'Delete this task?', lines: [t.title], confirmText: 'Delete', danger: true })) store.del('agent_tasks', t.id); } }, icon('trash', 14)))));
  }
  async function move(t, dir) {
    const next = TASK_STATUS[TASK_STATUS.findIndex(s => s.id === t.status) + dir];
    if (!next) return;
    if (next.id === 'queued' && !(await confirmBox({ title: 'Queue this task?', confirmText: 'Queue it', lines: ['The real agent will do this when the queue is picked up in Claude Code.', ['Who', (agentOf(t.agentId) || {}).title || 'Unassigned'], ['Task', t.title]] }))) return;
    store.put('agent_tasks', { ...t, status: next.id, updatedAt: new Date().toISOString() });
    store.log((agentOf(t.agentId) || {}).title + ': "' + t.title + '" is now ' + next.label.toLowerCase(), t.clientId ? 'client:' + t.clientId : '');
  }

  function newTask(agentId) {
    const c = drawer('New task');
    const staff = store.list('agents').filter(a => !a.human);
    const f = { who: select(staff.map(a => [a.id, a.title]), agentId || 'coo'), title: input({}), details: textarea({ rows: 4 }, ''),
      client: select([['', 'No client'], ...store.list('clients').map(x => [x.id, x.name])], ''), pri: select([['normal', 'Normal'], ['high', 'High']], 'normal') };
    const err = h('p', { class: 'form-error', role: 'alert' });
    c.body.append(h('form', { class: 'form', onsubmit: e => {
      e.preventDefault();
      if (!f.title.value.trim()) { err.textContent = 'Say what the task is.'; return; }
      store.put('agent_tasks', { agentId: f.who.value, clientId: f.client.value, title: f.title.value.trim(), details: f.details.value.trim(), priority: f.pri.value, status: 'backlog', createdAt: new Date().toISOString() });
      c.close(); toast('Added to the backlog. Queue it when you are ready.');
    } }, field('Who', f.who, 'Not sure who? The Chief Operating Officer routes work to the right department.'), field('Task', f.title), field('Details', f.details), field('Client', f.client), field('Priority', f.pri), err,
      h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Add to backlog' }))));
    f.title.focus();
  }

  /* ---------- person drawer ---------- */
  function openAgent(id, t) {
    open = id; tab = t || 'chat';
    ctl = drawer((agentOf(id) || {}).title || 'Team member');
    paintAgent();
  }
  function paintAgent() {
    const a = agentOf(open); if (!a) return;
    ctl.setTitle(a.title);
    const b = ctl.body; b.replaceChildren();
    const [st, tone] = statusOf(a);
    const tabs = a.human ? [['profile', 'Profile']] : [['chat', 'Chat'], ['tasks', 'Tasks'], ['profile', 'Profile']];
    b.append(
      h('div', { class: 'person-top' }, avatar(a.human ? a.name : a.title, a.human ? 'gold' : 'green', a.abbr), h('div', { class: 'grow' }, h('strong', { text: a.human ? a.name : a.title }), h('span', { class: 'muted small block', text: a.dept + (a.reportsTo ? ' · reports to ' + (agentOf(a.reportsTo) || {}).title : '') })), pill(st, tone)),
      h('div', { class: 'seg fill', role: 'tablist' }, tabs.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-pressed': String(tab === id), onclick: () => { tab = id; paintAgent(); } }, label))),
      tab === 'chat' ? chat(a) : tab === 'tasks' ? tasksTab(a) : profileTab(a));
    if (tab === 'chat') { const log = b.querySelector('.chat-log'); if (log) log.scrollTop = log.scrollHeight; }
  }

  function chat(a) {
    const msgs = store.list('messages').filter(m => m.agentId === a.id).sort((x, y) => new Date(x.at) - new Date(y.at));
    const box = textarea({ rows: 3, placeholder: 'Message ' + a.title, 'aria-label': 'Message ' + a.title }, '');
    const model = activeModel();
    const send = async () => {
      const text = box.value.trim(); if (!text) return;
      box.value = '';
      store.put('messages', { agentId: a.id, from: 'me', text, at: new Date().toISOString() });

      if (MODE !== 'remote') {
        store.put('messages', { agentId: a.id, from: 'system', text: 'Local preview cannot reach the model, this only works on the live site.', at: new Date(Date.now() + 1).toISOString() });
        return;
      }
      if (!model) {
        store.put('messages', { agentId: a.id, from: 'system', text: 'No model is set yet. Pick one in Settings, then message again.', at: new Date(Date.now() + 1).toISOString() });
        return;
      }
      const history = store.list('messages').filter(m => m.agentId === a.id).sort((x, y) => new Date(x.at) - new Date(y.at)).slice(-10).map(m => ({ from: m.from, text: m.text }));
      try {
        const payload = wireRequest(model.provider, model.model, model.engines, {
          agent: { title: a.title, dept: a.dept, blurb: a.blurb, skills: a.skills || [] },
          history, message: text
        });
        const res = await remote.fn('agent-chat', payload);
        store.put('messages', { agentId: a.id, from: 'system', text: res.reply, at: new Date().toISOString() });
      } catch (e) {
        store.put('messages', { agentId: a.id, from: 'system', text: 'Could not get a reply: ' + e.message, at: new Date().toISOString() });
      }
    };
    const asTask = () => {
      const text = box.value.trim(); if (!text) { toast('Write the task first.'); return; }
      store.put('agent_tasks', { agentId: a.id, clientId: '', title: text.split('\n')[0].slice(0, 120), details: text, priority: 'normal', status: 'backlog', createdAt: new Date().toISOString() });
      box.value = ''; toast('Added to ' + a.title + '\'s backlog');
    };
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
    return h('div', { class: 'chat' },
      h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' }, msgs.length ? msgs.map(m => h('div', { class: 'bubble ' + m.from }, h('p', { text: m.text }), h('span', { class: 'muted small', text: fmt.ago(m.at) })))
        : h('p', { class: 'muted pad', text: 'No messages yet. ' + a.blurb })),
      box,
      h('div', { class: 'actions wrap' }, h('button', { class: 'btn primary', type: 'button', onclick: send }, icon('send', 16), 'Send'), h('button', { class: 'btn', type: 'button', onclick: asTask }, icon('spark', 16), 'Make it a task')),
      h('p', { class: 'hint', text: model ? 'Replies come from ' + model.provider + ' (' + model.model + '), set in Settings. Press Command Enter to send.' : 'Set a model in Settings to get real replies here. Press Command Enter to send.' }));
  }

  function tasksTab(a) {
    const t = tasksFor(a.id).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    return h('div', { class: 'stack' },
      h('button', { class: 'btn', type: 'button', onclick: () => newTask(a.id) }, icon('plus', 16), 'New task for ' + a.title),
      t.length ? t.map(x => taskCard(x, false)) : empty('No tasks for this person yet.'));
  }

  function profileTab(a) {
    const boss = a.reportsTo && agentOf(a.reportsTo), reports = store.list('agents').filter(x => x.reportsTo === a.id);
    const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), typeof v === 'string' ? h('span', { text: v }) : v);
    const jump = x => h('button', { class: 'text-link as-link', type: 'button', onclick: () => { open = x.id; tab = x.human ? 'profile' : 'chat'; paintAgent(); }, text: x.title });
    return h('div', { class: 'stack' },
      h('p', { text: a.blurb }),
      (a.skills || []).length ? h('div', { class: 'pills' }, a.skills.map(s => pill(s, 'neutral'))) : null,
      kv('Department', a.dept), boss ? kv('Reports to', jump(boss)) : null,
      reports.length ? kv('Direct reports', h('span', { class: 'links' }, reports.map(jump))) : null,
      !a.human ? kv('Agent name', h('code', { text: a.agentKey })) : null,
      a.model ? kv('Model', a.model) : null,
      !a.human ? kv('Runs in', a.home === 'project' ? 'Claude Code opened in ~/towpath-agency' : 'Any Claude Code session') : null);
  }
}
