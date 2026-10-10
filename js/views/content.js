import { h, icon, pill, field, input, select, textarea, drawer, confirmBox, toast, empty, fmt } from '../ui.js';
import { store } from '../store.js';
import { CONTENT_STATUS, contentStatusOf } from '../model.js';

const ui = { q: '', client: 'all', status: 'all' };

export function mount(root, { args }) {
  let ctl = null, openId = null;

  const page = h('div', { class: 'page' });
  const results = h('div', { class: 'results' });
  const summary = h('p', { class: 'muted small', 'aria-live': 'polite' });

  const clients = () => store.list('clients');
  const clientName = id => (store.get('clients', id) || {}).name || 'Unknown client';

  const search = input({ id: 'ct-q', type: 'search', placeholder: 'Search title or topic', 'aria-label': 'Search content', value: ui.q });
  search.addEventListener('input', () => { ui.q = search.value; renderResults(); });
  const clientSel = select([['all', 'All clients'], ...clients().map(c => [c.id, c.name])], ui.client, { 'aria-label': 'Filter by client' });
  clientSel.addEventListener('change', () => { ui.client = clientSel.value; renderResults(); });
  const statusSel = select([['all', 'Any status'], ...CONTENT_STATUS.map(s => [s.id, s.label])], ui.status, { 'aria-label': 'Filter by status' });
  statusSel.addEventListener('change', () => { ui.status = statusSel.value; renderResults(); });

  page.append(
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'Content' }), h('h1', { text: 'Client content calendar' }),
        h('p', { class: 'muted', text: 'Every blog post and content piece across all clients, from drafted through live. Add one to the CRM calendar once it has a date, and check it against the real site once it should be up.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => addPost() }, icon('plus', 16), 'Add post'))),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 16), search), clientSel, statusSel),
    summary, results);
  root.append(page);

  /* ---------- results ---------- */
  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return store.list('content_posts')
      .filter(p => (ui.client === 'all' || p.clientId === ui.client) && (ui.status === 'all' || p.status === ui.status)
        && (!q || [p.title, p.topic].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => new Date(a.scheduledDate || a.createdAt || 0) - new Date(b.scheduledDate || b.createdAt || 0));
  }

  function renderResults() {
    const rows = filtered();
    summary.textContent = rows.length + (rows.length === 1 ? ' post' : ' posts');
    results.replaceChildren(rows.length
      ? h('div', { class: 'cards' }, rows.map(p => h('div', { class: 'card' },
          h('button', { class: 'card-open', type: 'button', onclick: () => openPost(p.id) },
            h('strong', { text: p.title }), h('span', { class: 'muted small', text: clientName(p.clientId) + (p.scheduledDate ? ' · ' + fmt.short(p.scheduledDate) : '') })),
          h('div', { class: 'card-foot' }, pill(contentStatusOf(p.status).label, contentStatusOf(p.status).tone),
            p.url ? h('a', { class: 'small', href: p.url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, icon('external', 14)) : null))))
      : empty('No content yet. Add a post to start the calendar.', h('button', { class: 'btn primary', type: 'button', onclick: () => addPost() }, 'Add your first post')));
    if (ctl && ctl.body.isConnected && openId && store.get('content_posts', openId)) renderPost(openId);
  }

  /* ---------- calendar linking ---------- */
  function syncCalendarEvent(p) {
    if (!p.scheduledDate) return p;
    const start = new Date(p.scheduledDate + 'T09:00').toISOString();
    const title = clientName(p.clientId) + ': ' + p.title;
    if (p.calendarEventId && store.get('events', p.calendarEventId)) {
      store.put('events', { ...store.get('events', p.calendarEventId), title, start, kind: 'Content' });
      return p;
    }
    const ev = store.put('events', { title, kind: 'Content', start, allDay: true, notes: 'Content post, tracked in the Content tab.' });
    return { ...p, calendarEventId: ev.id };
  }

  /* ---------- detail ---------- */
  function openPost(id) {
    const p = store.get('content_posts', id);
    if (!p) return;
    openId = id;
    ctl = drawer(p.title);
    renderPost(id);
  }

  function renderPost(id) {
    const p = store.get('content_posts', id);
    if (!p) return;
    ctl.setTitle(p.title);
    const b = ctl.body; b.replaceChildren();

    const statusSel2 = select(CONTENT_STATUS.map(s => [s.id, s.label]), p.status, { 'aria-label': 'Status' });
    statusSel2.addEventListener('change', () => {
      const changes = { status: statusSel2.value };
      if (statusSel2.value === 'published' && !p.publishedDate) changes.publishedDate = new Date().toISOString();
      store.put('content_posts', { ...store.get('content_posts', id), ...changes });
      toast('Status updated');
    });

    b.append(
      h('div', { class: 'pills' }, pill(clientName(p.clientId), 'neutral'), pill(contentStatusOf(p.status).label, contentStatusOf(p.status).tone)),
      h('p', { class: 'muted', text: p.topic || 'No topic/keyword recorded.' }),

      section('Dates',
        kv('Scheduled', p.scheduledDate ? fmt.date(p.scheduledDate) : 'Not scheduled'),
        kv('Published', p.publishedDate ? fmt.date(p.publishedDate) : 'Not yet')),

      section('Where it lives',
        p.filePath ? kv('Local file', p.filePath) : null,
        p.url
          ? h('div', { class: 'actions wrap' }, h('a', { class: 'btn small', href: p.url, target: '_blank', rel: 'noopener' }, icon('external', 14), 'Open live ↗'))
          : h('p', { class: 'muted small', text: 'No live URL yet.' }),
        h('p', { class: 'hint', text: 'This opens the real page so you can check it yourself. The CRM can’t confirm a post is live on its own, since every client site is a separate server.' })),

      section('Status', statusSel2,
        p.status !== 'published' && p.url
          ? h('button', { class: 'btn small', type: 'button', onclick: () => {
              store.put('content_posts', { ...store.get('content_posts', id), status: 'published', publishedDate: new Date().toISOString() });
              store.log('Marked live: ' + p.title, 'content:' + id);
              toast('Marked as published');
            } }, 'I checked, it’s live')
          : null),

      section('Calendar',
        p.calendarEventId && store.get('events', p.calendarEventId)
          ? h('p', { class: 'muted small', text: 'On the calendar for ' + fmt.short(store.get('events', p.calendarEventId).start) + '.' })
          : h('button', { class: 'btn small', type: 'button', disabled: !p.scheduledDate, onclick: () => {
              const updated = syncCalendarEvent(store.get('content_posts', id));
              store.put('content_posts', updated);
              store.log('Added to calendar: ' + p.title, 'content:' + id);
              toast('Added to calendar');
            } }, icon('calendar', 14), p.scheduledDate ? 'Add to calendar' : 'Set a scheduled date first')),

      p.notes ? section('Notes', h('p', { text: p.notes })) : null,

      section('Manage',
        h('button', { class: 'btn small danger-outline', type: 'button', onclick: async () => {
          if (await confirmBox({ title: 'Delete this post?', lines: [p.title], confirmText: 'Delete post', danger: true })) {
            if (p.calendarEventId && store.get('events', p.calendarEventId)) store.del('events', p.calendarEventId);
            store.del('content_posts', id); ctl.close(); toast('Post deleted');
          }
        } }, icon('trash', 14), 'Delete post')));
  }

  /* ---------- add by hand ---------- */
  function addPost() {
    openId = null;
    ctl = drawer('Add content post');
    const f = {
      client: select(clients().map(c => [c.id, c.name]), (clients()[0] || {}).id),
      title: input({ required: true }), topic: input({}),
      status: select(CONTENT_STATUS.map(s => [s.id, s.label]), 'drafted'),
      scheduled: input({ type: 'date' }), url: input({ type: 'url', placeholder: 'https://…' }),
      filePath: input({ placeholder: 'blog/slug.html' }), notes: textarea({ rows: 2 }, '')
    };
    const err = h('p', { class: 'form-error', role: 'alert' });
    ctl.body.append(h('form', { class: 'form', onsubmit: e => {
      e.preventDefault();
      if (!f.title.value.trim()) { err.textContent = 'Add a title.'; f.title.focus(); return; }
      if (!f.client.value) { err.textContent = 'Pick a client.'; return; }
      let post = {
        clientId: f.client.value, title: f.title.value.trim(), topic: f.topic.value.trim(),
        status: f.status.value, scheduledDate: f.scheduled.value || '', publishedDate: '',
        url: f.url.value.trim(), filePath: f.filePath.value.trim(), notes: f.notes.value.trim(),
        calendarEventId: '', createdAt: new Date().toISOString()
      };
      if (post.scheduledDate) post = syncCalendarEvent(post);
      post = store.put('content_posts', post);
      store.log('Added content post: ' + post.title, 'content:' + post.id);
      ctl.close(); toast('Post added'); openPost(post.id);
    } },
      field('Client', f.client), field('Title', f.title), field('Topic / keyword', f.topic),
      field('Status', f.status), field('Scheduled date', f.scheduled), field('Live URL', f.url),
      field('Local file path', f.filePath, 'Where the file lives on this Mac, if you have one.'), field('Notes', f.notes),
      err, h('div', { class: 'actions end' }, h('button', { class: 'btn primary', type: 'submit', text: 'Add post' }))));
    f.title.focus();
  }

  const section = (title, ...kids) => kids.some(Boolean) ? h('section', { class: 'dsec' }, h('h3', { text: title }), ...kids) : null;
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), h('span', { text: v }));

  renderResults();
  const off = store.sub(c => { if (c === 'content_posts' || c === 'clients' || c === '*') renderResults(); });
  if (args[0]) openPost(args[0]);
  return off;
}
