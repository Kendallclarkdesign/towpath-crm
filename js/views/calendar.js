import { h, icon, fmt, pill, field, input, select, textarea, drawer, confirmBox, toast, empty, panel, infoIcon, ymd, addDays, startOfDay, sameDay } from '../ui.js';
import { store } from '../store.js';
import { nextFollowUp } from '../model.js';

/* Google Calendar connection. Today: an embedded view of your Google calendar
   (works when you are signed in to Google in this browser) plus .ics import.
   Two way sync needs Google sign in and is part of the deploy step. */
const GOOGLE_CAL = 'you@example.com';
const KINDS = ['Call', 'Meeting', 'Follow-up', 'Deadline', 'Content', 'Personal'];
const ui = { view: 'month', cursor: startOfDay(new Date()) };
const OPEN_START = 9, OPEN_END = 17; /* 9am to 5pm, the hours slots are offered in */

/* ---------- schedule a meeting (booking flow, callable from Leads and Clients too) ---------- */
/* prefill: { day, with: 'client:<id>' | 'lead:<id>', title } */
export function scheduleMeeting(prefill = {}) {
  const ctl = drawer('Schedule a meeting');
  const leads = store.list('leads'), clients = store.list('clients');
  const withSel = select([['', 'No one in particular'], ...clients.map(c => ['client:' + c.id, c.name + ' (client)']), ...leads.map(l => ['lead:' + l.id, l.name + ' (lead)'])], prefill.with || '', { 'aria-label': 'With' });
  const title = input({ required: true, placeholder: 'What is this meeting about?', value: prefill.title || '' });
  const dateIn = input({ type: 'date', 'aria-label': 'Date' }); dateIn.value = ymd(prefill.day || new Date());
  const durSel = select([['30', '30 minutes'], ['60', '1 hour'], ['15', '15 minutes'], ['45', '45 minutes']], '30', { 'aria-label': 'Duration' });
  const notes = textarea({ rows: 3, placeholder: 'Optional' }, '');
  const err = h('p', { class: 'form-error', role: 'alert' });
  const slotsBox = h('div', { class: 'slots' });
  let chosen = null;

  function drawSlots() {
    const day0 = new Date(dateIn.value + 'T00:00:00');
    const busy = store.list('events').filter(e => !e.allDay && sameDay(e.start, day0))
      .map(e => ({ start: new Date(e.start), end: e.end ? new Date(e.end) : new Date(new Date(e.start).getTime() + 30 * 60000) }));
    const dur = Number(durSel.value) * 60000;
    const slots = [];
    for (let m = OPEN_START * 60; m < OPEN_END * 60; m += 30) {
      const s = new Date(day0); s.setMinutes(m);
      const e = new Date(s.getTime() + dur);
      slots.push({ s, e, taken: busy.some(b => s < b.end && e > b.start) });
    }
    if (chosen && !slots.some(sl => sl.s.getTime() === chosen.getTime() && !sl.taken)) chosen = null;
    slotsBox.replaceChildren(...slots.map(sl => h('button', {
      class: 'slot' + (sl.taken ? ' busy' : '') + (chosen && sl.s.getTime() === chosen.getTime() ? ' picked' : ''),
      type: 'button', disabled: sl.taken, 'aria-pressed': String(!!(chosen && sl.s.getTime() === chosen.getTime())),
      onclick: () => { chosen = sl.s; drawSlots(); }
    }, fmt.time(sl.s))));
  }
  dateIn.addEventListener('change', () => { chosen = null; drawSlots(); });
  durSel.addEventListener('change', () => { chosen = null; drawSlots(); });
  drawSlots();

  ctl.body.append(h('form', { class: 'form', onsubmit: e => {
    e.preventDefault();
    if (!title.value.trim()) { err.textContent = 'Give the meeting a title.'; return; }
    if (!chosen) { err.textContent = 'Pick an open time below.'; return; }
    const end = new Date(chosen.getTime() + Number(durSel.value) * 60000);
    const [kind, id] = withSel.value ? withSel.value.split(':') : [null, null];
    store.put('events', { title: title.value.trim(), kind: 'Meeting', start: chosen.toISOString(), end: end.toISOString(), allDay: false, notes: notes.value.trim(),
      clientId: kind === 'client' ? id : '', leadId: kind === 'lead' ? id : '' });
    store.log('Scheduled: ' + title.value.trim() + ', ' + fmt.short(chosen) + ' at ' + fmt.time(chosen), kind === 'client' ? 'client:' + id : kind === 'lead' ? 'lead:' + id : '');
    ctl.close(); toast('Meeting scheduled');
  } },
    field('With', withSel), field('Title', title), field('Date', dateIn), field('Duration', durSel),
    h('div', { class: 'field' },
      h('div', { class: 'actions' }, h('label', { text: 'Pick an open time' }), infoIcon('Open hours are 9am to 5pm. Greyed-out times overlap something already on your calendar for that day, pick a different time or duration.', 'time slots')),
      slotsBox),
    field('Notes', notes), err,
    h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Schedule it' }))));
  title.focus();
}

export function mount(root, { query }) {
  if (query.get('view')) ui.view = query.get('view');
  const page = h('div', { class: 'page' });
  root.append(page);
  const render = () => page.replaceChildren(...build());
  const off = store.sub(c => { if (['events', 'leads', 'agent_tasks', '*'].includes(c)) render(); });
  render();
  return off;

  /* everything that belongs on a calendar day, from four sources */
  function itemsOn(day) {
    const items = [];
    store.list('events').forEach(e => { if (sameDay(e.start, day)) items.push({ type: 'event', e, t: new Date(e.start), title: e.title, kind: e.kind || 'Event' }); });
    store.list('leads').forEach(l => { const d = nextFollowUp(l); if (d && sameDay(d, day)) items.push({ type: 'follow', t: d, title: 'Follow up: ' + l.name, kind: 'Follow-up', href: '#/leads/' + l.id }); });
    return items.sort((a, b) => a.t - b.t);
  }

  function build() {
    const head = h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'Calendar' }), h('h1', { text: ui.view === 'google' ? 'Google Calendar' : ui.cursor.toLocaleDateString([], { month: 'long', year: 'numeric' }) }),
        h('p', { class: 'muted', text: 'Events you add here, lead follow-ups that are due, and your real Google Calendar side by side. Switch views above, import an .ics file, or add an event by hand.' })),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn', type: 'button', onclick: importIcs }, 'Import .ics'),
        h('button', { class: 'btn', type: 'button', onclick: () => editEvent(null, ui.cursor) }, icon('plus', 16), 'Add event'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => scheduleMeeting({ day: ui.cursor }) }, icon('clock', 16), 'Schedule a meeting')));
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Calendar view' },
      [['month', 'Month'], ['agenda', 'Agenda'], ['google', 'Google']].map(([id, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(ui.view === id), onclick: () => { ui.view = id; render(); } }, label)));
    const nav = ui.view === 'google' ? null : h('div', { class: 'cal-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous', onclick: () => { ui.cursor = shift(-1); render(); } }, icon('chevL')),
      h('button', { class: 'btn small', type: 'button', onclick: () => { ui.cursor = startOfDay(new Date()); render(); } }, 'Today'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next', onclick: () => { ui.cursor = shift(1); render(); } }, icon('chevR')));
    const body = ui.view === 'google' ? google() : ui.view === 'agenda' ? agenda() : month();
    return [head, h('div', { class: 'toolbar' }, seg, nav), body];
  }
  function shift(n) { const d = new Date(ui.cursor); if (ui.view === 'agenda') return addDays(d, n * 14); d.setMonth(d.getMonth() + n, 1); return d; }

  function month() {
    const first = new Date(ui.cursor.getFullYear(), ui.cursor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    const today = new Date();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      if (i >= 35 && day.getMonth() !== first.getMonth()) break;
      const its = itemsOn(day);
      cells.push(h('button', { type: 'button', class: 'cal-cell' + (day.getMonth() !== first.getMonth() ? ' dim' : '') + (sameDay(day, today) ? ' today' : ''),
        'aria-label': fmt.day(day) + ', ' + its.length + ' items', onclick: () => dayDrawer(day) },
        h('span', { class: 'cal-d num', text: day.getDate() }),
        its.slice(0, 2).map(x => h('span', { class: 'chip ' + (x.type === 'follow' ? 'gold' : ''), text: x.title })),
        its.length > 2 ? h('span', { class: 'muted small', text: '+' + (its.length - 2) + ' more' }) : null));
    }
    return h('div', { class: 'cal' },
      h('div', { class: 'cal-head', 'aria-hidden': 'true' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => h('span', { text: d }))),
      h('div', { class: 'cal-grid' }, cells));
  }

  function agenda() {
    const start = startOfDay(ui.cursor), days = [];
    for (let i = 0; i < 14; i++) { const d = addDays(start, i), its = itemsOn(d); if (its.length) days.push([d, its]); }
    if (!days.length) return panel('Next 14 days', null, empty('Nothing scheduled. Add an event or move a lead into Outreach to see follow-ups here.'));
    return h('div', null, days.map(([d, its]) => panel(fmt.day(d), null, h('div', { class: 'list' }, its.map(x => itemRow(x))))));
  }

  function itemRow(x) {
    const inner = [h('span', { class: 'when num', text: x.type === 'event' && !x.e.allDay ? fmt.time(x.t) : 'All day' }),
      h('div', { class: 'grow' }, h('strong', { text: x.title }), x.type === 'event' && x.e.notes ? h('span', { class: 'muted small block', text: x.e.notes }) : null), pill(x.kind, x.type === 'follow' ? 'gold' : '')];
    return x.type === 'event'
      ? h('button', { class: 'list-item as-btn', type: 'button', onclick: () => editEvent(x.e) }, ...inner)
      : h('a', { class: 'list-item', href: x.href }, ...inner);
  }

  function dayDrawer(day) {
    const ctl = drawer(fmt.day(day));
    const its = itemsOn(day);
    ctl.body.append(its.length ? h('div', { class: 'list' }, its.map(x => itemRow(x))) : empty('Nothing on this day.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { ctl.close(); editEvent(null, day); } }, icon('plus', 16), 'Add event'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => { ctl.close(); scheduleMeeting({ day }); } }, icon('clock', 16), 'Schedule a meeting')));
  }

  function editEvent(ev, day) {
    const ctl = drawer(ev ? 'Edit event' : 'New event');
    const base = ev ? new Date(ev.start) : new Date(day || Date.now());
    const f = {
      title: input({ required: true, value: ev ? ev.title : '' }),
      kind: select(KINDS, ev ? ev.kind : 'Call'),
      date: input({ type: 'date', value: ymd(base) }),
      time: input({ type: 'time', value: ev && !ev.allDay ? new Date(ev.start).toTimeString().slice(0, 5) : '10:00' }),
      allDay: h('input', { type: 'checkbox', id: 'ev-all' }),
      notes: textarea({ rows: 3 }, ev ? ev.notes : '')
    };
    f.allDay.checked = !!(ev && ev.allDay);
    const err = h('p', { class: 'form-error', role: 'alert' });
    ctl.body.append(h('form', { class: 'form', onsubmit: e => {
      e.preventDefault();
      if (!f.title.value.trim()) { err.textContent = 'Give the event a title.'; return; }
      const start = new Date(f.date.value + 'T' + (f.allDay.checked ? '00:00' : f.time.value || '10:00'));
      store.put('events', { ...(ev || {}), title: f.title.value.trim(), kind: f.kind.value, start: start.toISOString(), allDay: f.allDay.checked, notes: f.notes.value.trim() });
      ctl.close(); toast(ev ? 'Event updated' : 'Event added');
    } },
      field('Title', f.title), field('Type', f.kind), field('Date', f.date),
      h('div', { class: 'check' }, f.allDay, h('label', { for: 'ev-all', text: 'All day' })),
      field('Time', f.time), field('Notes', f.notes), err,
      h('div', { class: 'actions end' },
        ev ? h('button', { class: 'btn danger-outline', type: 'button', onclick: async () => { if (await confirmBox({ title: 'Delete this event?', lines: [ev.title], confirmText: 'Delete', danger: true })) { store.del('events', ev.id); toast('Event deleted'); } } }, 'Delete') : null,
        h('button', { class: 'btn primary', type: 'submit', text: 'Save' }))));
    f.title.focus();
  }

  function google() {
    const src = 'https://calendar.google.com/calendar/embed?height=700&wkst=1&ctz=America%2FNew_York&mode=MONTH&showTitle=0&showPrint=0&src=' + encodeURIComponent(GOOGLE_CAL);
    return h('div', null,
      h('div', { class: 'callout' }, h('p', { text: 'This is your Google calendar, shown inside the CRM. It appears when you are signed in to Google in this browser. Events you add here in the CRM stay in the CRM. Two way sync arrives with the Google connection at deploy.' })),
      h('iframe', { class: 'gcal', src, title: 'Google Calendar', loading: 'lazy', referrerpolicy: 'no-referrer' }));
  }

  function importIcs() {
    const file = h('input', { type: 'file', accept: '.ics,text/calendar' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const text = (await f.text()).replace(/\r?\n[ \t]/g, '');
      const found = [...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(m => {
        const pick = k => { const r = new RegExp('^' + k + '[^:\\n]*:(.*)$', 'm').exec(m[1]); return r ? r[1].trim() : ''; };
        const raw = pick('DTSTART'); if (!raw) return null;
        const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8), allDay = raw.length === 8;
        const start = allDay ? new Date(y + '-' + mo + '-' + d + 'T00:00:00') : new Date(y + '-' + mo + '-' + d + 'T' + raw.slice(9, 11) + ':' + raw.slice(11, 13) + ':' + raw.slice(13, 15) + (raw.endsWith('Z') ? 'Z' : ''));
        return { title: pick('SUMMARY').replace(/\\,/g, ',') || '(no title)', kind: 'Meeting', start: start.toISOString(), allDay, notes: pick('DESCRIPTION').replace(/\\n/g, ' ').replace(/\\,/g, ',').slice(0, 300) };
      }).filter(Boolean);
      if (!found.length) { toast('No events found in that file.'); return; }
      if (await confirmBox({ title: 'Import ' + found.length + ' events?', lines: ['They are added to the CRM calendar. Your Google calendar is not changed.'], confirmText: 'Import' })) {
        found.forEach(e => store.put('events', e)); store.log('Imported ' + found.length + ' calendar events'); toast('Imported ' + found.length + ' events');
      }
    });
    file.click();
  }
}
