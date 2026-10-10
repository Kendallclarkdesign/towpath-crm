import { h, icon, fmt, pill, panel, empty, link, startOfDay, addDays, sameDay } from '../ui.js';
import { store } from '../store.js';
import { STAGES, stageOf, nextFollowUp } from '../model.js';

export function mount(root) {
  const page = h('div', { class: 'page' });
  root.append(page);
  const render = () => page.replaceChildren(...build());
  const off = store.sub(render);
  render();
  return off;
}

function build() {
  const now = new Date(), hr = now.getHours();
  const hello = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', Kendall';
  const leads = store.list('leads'), clients = store.list('clients'), tasks = store.list('agent_tasks'), agents = store.list('agents');
  const by = id => leads.filter(l => l.stage === id).length;
  const live = leads.filter(l => l.stage !== 'declined' && l.stage !== 'won');

  const head = h('div', { class: 'page-head' },
    h('div', null, h('p', { class: 'eyebrow', text: hello }), h('h1', { text: now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) }),
      h('p', { class: 'muted', text: 'A snapshot of everything, where leads sit in the pipeline, what is due today, which clients need attention, and what the team is working on. Click any number or row to jump straight to it.' })),
    h('div', { class: 'actions' },
      h('a', { class: 'btn', href: '#/leads?new=1' }, icon('plus', 16), 'Add lead'),
      h('a', { class: 'btn primary', href: '#/email' }, icon('mail', 16), 'New email')));

  const kpi = (n, label, href, tone) => h('a', { class: 'kpi' + (tone ? ' ' + tone : ''), href },
    h('span', { class: 'kpi-n num', text: n }), h('span', { class: 'kpi-l', text: label }));
  const kpis = h('div', { class: 'kpis' },
    kpi(live.length, 'Leads in pipeline', '#/leads'),
    kpi(by('drafted'), 'Drafted, ready to review', '#/leads?stage=drafted', 'gold'),
    kpi(by('outreach'), 'In outreach', '#/leads?stage=outreach'),
    kpi(by('interested'), 'Interested', '#/leads?stage=interested', 'good'),
    kpi(clients.length, 'Clients', '#/clients'));

  /* pipeline funnel */
  const shown = STAGES.filter(s => s.id !== 'declined');
  const max = Math.max(1, ...shown.map(s => by(s.id)));
  const funnel = panel('Pipeline', link('#/leads', 'Open leads'),
    h('div', { class: 'funnel' }, shown.map(s => h('a', { class: 'funnel-row', href: '#/leads?stage=' + s.id },
      h('span', { class: 'funnel-l', text: s.label }),
      h('span', { class: 'funnel-track' }, h('span', { class: 'funnel-bar ' + (s.tone || 'base'), style: 'width:' + Math.max(by(s.id) ? 4 : 0, by(s.id) / max * 100) + '%' })),
      h('span', { class: 'funnel-n num', text: by(s.id) })))));

  /* today */
  const dayEnd = addDays(startOfDay(now), 1);
  const events = store.list('events').filter(e => sameDay(e.start, now)).sort((a, b) => new Date(a.start) - new Date(b.start));
  const due = leads.map(l => ({ l, d: nextFollowUp(l) })).filter(x => x.d && x.d < dayEnd).sort((a, b) => a.d - b.d);
  const dueDrafts = store.list('emails').filter(e => e.status === 'draft' && e.scheduledFor && new Date(e.scheduledFor + 'T00:00:00') < dayEnd);
  const rows = [];
  events.forEach(e => rows.push(h('div', { class: 'list-item' },
    h('span', { class: 'when num', text: e.allDay ? 'All day' : fmt.time(e.start) }),
    h('div', { class: 'grow' }, h('strong', { text: e.title }), e.notes ? h('span', { class: 'muted small block', text: e.notes }) : null),
    pill(e.kind || 'Event'))));
  due.forEach(({ l, d }) => rows.push(h('a', { class: 'list-item', href: '#/leads/' + l.id },
    h('span', { class: 'when num', text: d < startOfDay(now) ? 'Overdue' : 'Today' }),
    h('div', { class: 'grow' }, h('strong', { text: 'Follow up: ' + l.name }), h('span', { class: 'muted small block', text: l.town })),
    pill('Follow-up', 'gold'))));
  dueDrafts.forEach(e => rows.push(h('a', { class: 'list-item', href: '#/email' },
    h('span', { class: 'when num', text: new Date(e.scheduledFor + 'T00:00:00') < startOfDay(now) ? 'Overdue' : 'Today' }),
    h('div', { class: 'grow' }, h('strong', { text: 'Send: ' + (e.subject || '(no subject)') }), h('span', { class: 'muted small block', text: e.to || 'No recipient' })),
    pill('Scheduled', 'gold'))));
  const today = panel('Today', link('#/calendar', 'Calendar'),
    rows.length ? h('div', { class: 'list' }, rows)
      : empty('Nothing scheduled and no follow-ups due. A good day to work the drafted leads.', h('a', { class: 'btn small', href: '#/leads?stage=drafted' }, 'See drafted leads')));

  /* clients to watch */
  const watch = clients.map(c => {
    const open = (c.items || []).filter(i => i.state === 'open');
    return { c, open, high: open.filter(i => i.sev === 'high').length };
  }).sort((a, b) => b.high - a.high || b.open.length - a.open.length);
  const clientPanel = panel('Client watch', link('#/clients', 'All clients'),
    watch.length ? h('div', { class: 'list' }, watch.map(({ c, open, high }) => h('a', { class: 'list-item', href: '#/clients/' + c.id },
      h('div', { class: 'grow' }, h('strong', { text: c.name }),
        h('span', { class: 'muted small block clamp', text: open[0] ? open[0].text : 'Nothing open.' })),
      high ? pill(high + ' high', 'danger') : null,
      pill(open.length + ' open', open.length ? 'neutral' : 'good')))) : empty('No clients yet.'));

  /* agent queue */
  const title = id => (agents.find(a => a.id === id) || {}).title || 'Unassigned';
  const c = s => tasks.filter(t => t.status === s).length;
  const active = tasks.filter(t => t.status !== 'done').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const queue = panel('Team queue', link('#/team?view=queue', 'Open queue'),
    h('div', { class: 'mini-stats' },
      h('div', null, h('b', { class: 'num', text: c('queued') }), h('span', { text: 'Queued' })),
      h('div', null, h('b', { class: 'num', text: c('running') }), h('span', { text: 'Running' })),
      h('div', null, h('b', { class: 'num', text: c('review') }), h('span', { text: 'Needs your review' })),
      h('div', null, h('b', { class: 'num', text: c('backlog') }), h('span', { text: 'Backlog' }))),
    active.length ? h('div', { class: 'list' }, active.map(t => h('a', { class: 'list-item', href: '#/team?view=queue' },
      h('div', { class: 'grow' }, h('strong', { class: 'clamp', text: t.title }), h('span', { class: 'muted small block', text: title(t.agentId) })),
      pill(t.status === 'review' ? 'Needs review' : t.status[0].toUpperCase() + t.status.slice(1), t.status === 'review' ? 'gold' : 'neutral'))))
      : empty('No open tasks with the team.'));

  /* activity */
  const acts = store.list('activity').slice().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  const activity = panel('Recent activity', null,
    acts.length ? h('div', { class: 'list' }, acts.map(a => h('div', { class: 'list-item' },
      h('span', { class: 'dot' }), h('div', { class: 'grow' }, h('span', { text: a.text })), h('span', { class: 'muted small nowrap', text: fmt.ago(a.at) }))))
      : empty('Activity shows up here as you work.'));

  return [head, kpis, h('div', { class: 'grid-2' }, funnel, today), h('div', { class: 'grid-2' }, clientPanel, queue), activity];
}
