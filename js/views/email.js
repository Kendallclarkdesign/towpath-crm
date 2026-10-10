import { h, icon, fmt, pill, field, input, select, textarea, confirmBox, toast, empty, panel, infoIcon, startOfDay } from '../ui.js';
import { store, MODE } from '../store.js';
import * as remote from '../remote.js';
import { FROM, SIGNATURE, TEMPLATES, renderTemplate, templateContext } from '../model.js';

/* Real sending, once Resend is connected in Settings (Integrations). Falls back to the
   copy/log workflow below when it isn't. */
function resendReady() {
  const s = store.get('settings', 'app');
  const r = s && s.engines && s.engines.resend;
  return !!(r && r.enabled && r.apiKey && r.fromEmail);
}
function engineFrom() {
  const s = store.get('settings', 'app');
  const r = s && s.engines && s.engines.resend;
  return (r && r.fromEmail) || FROM;
}

const draft = { id: null, to: '', subject: '', body: '', leadId: '', clientId: '', scheduledFor: '' };
const ui = { folder: 'compose' };
const blank = () => Object.assign(draft, { id: null, to: '', subject: '', body: '', leadId: '', clientId: '', scheduledFor: '' });
const known = v => v && v !== 'UNKNOWN';

export function mount(root, { query }) {
  if (query.get('lead')) {
    const l = store.get('leads', query.get('lead'));
    if (l) { Object.assign(draft, { id: null, to: l.email || '', subject: l.subject || '', body: l.body || '', leadId: l.id, clientId: '', scheduledFor: '' }); ui.folder = 'compose'; }
  } else if (query.get('client')) {
    const c = store.get('clients', query.get('client'));
    if (c) { Object.assign(draft, { id: null, to: known(c.email) ? c.email : '', subject: '', body: '', leadId: '', clientId: c.id, scheduledFor: '' }); ui.folder = 'compose'; }
  }
  const page = h('div', { class: 'page' });
  const pane = h('div', { class: 'mail-pane' });
  const nav = h('nav', { class: 'mail-nav', 'aria-label': 'Mailbox' });
  root.append(page);

  page.append(
    h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow', text: 'Email' }), h('h1', { text: 'Mail' }),
        h('p', { class: 'muted', text: 'Write and manage emails from one place: Compose a new one, work through lead drafts ready to review, pick up your own drafts, or check the sent log. Open the note below for how sending actually works today.' })),
      h('div', { class: 'actions' }, h('span', { class: 'from-chip' }, icon('mail', 15), FROM))),
    status(),
    h('div', { class: 'mail' }, nav, pane));

  function folders() {
    const emails = store.list('emails');
    const ready = store.list('leads').filter(l => l.stage === 'drafted');
    return [['compose', 'Compose', null], ['outreach', 'Lead drafts', ready.length], ['drafts', 'My drafts', emails.filter(e => e.status === 'draft').length], ['sent', 'Sent log', emails.filter(e => e.status === 'sent').length]];
  }
  function drawNav() {
    nav.replaceChildren(...folders().map(([id, label, n]) => h('button', { type: 'button', class: 'mail-tab', 'aria-current': ui.folder === id ? 'true' : null, onclick: () => { ui.folder = id; drawAll(); } },
      label, n != null ? h('span', { class: 'count num', text: n }) : null)));
  }
  function drawPane() {
    pane.replaceChildren(ui.folder === 'compose' ? compose() : ui.folder === 'outreach' ? outreach() : ui.folder === 'drafts' ? drafts() : sent());
  }
  function drawAll() { drawNav(); drawPane(); }

  /* keep counts fresh without rebuilding the compose form under the cursor */
  const off = store.sub(c => { if (c === 'emails' || c === 'leads' || c === '*') { drawNav(); if (ui.folder !== 'compose') drawPane(); } });
  drawAll();
  return off;

  /* ---------- compose ---------- */
  function compose() {
    const lead = draft.leadId && store.get('leads', draft.leadId), client = draft.clientId && store.get('clients', draft.clientId);
    const to = input({ id: 'm-to', type: 'email', value: draft.to, placeholder: 'name@business.com', list: 'm-people', autocomplete: 'off' });
    const people = h('datalist', { id: 'm-people' }, [
      ...store.list('clients').filter(c => known(c.email)).map(c => h('option', { value: c.email, label: c.name })),
      ...store.list('leads').filter(l => l.email).map(l => h('option', { value: l.email, label: l.name }))]);
    const subject = input({ id: 'm-subject', value: draft.subject, placeholder: 'Subject' });
    const body = textarea({ id: 'm-body', rows: 15, placeholder: 'Write your message' }, draft.body);
    const tpl = select([['', 'Start from a template'], ...TEMPLATES.map(t => [t.id, t.label])], '', { id: 'm-tpl' });
    const scheduled = input({ id: 'm-sched', type: 'date', 'aria-label': 'Schedule reminder for' }); scheduled.value = draft.scheduledFor || '';
    const sync = () => { draft.to = to.value; draft.subject = subject.value; draft.body = body.value; draft.scheduledFor = scheduled.value; };
    [to, subject, body, scheduled].forEach(el => el.addEventListener('input', sync));

    tpl.addEventListener('change', async () => {
      const t = TEMPLATES.find(x => x.id === tpl.value); if (!t) return;
      if (body.value.trim() && !(await confirmBox({ title: 'Replace what you wrote?', lines: ['The template will overwrite the subject and message.'], confirmText: 'Use template' }))) { tpl.value = ''; return; }
      const ctx = templateContext(lead, client);
      subject.value = renderTemplate(t.subject, ctx); body.value = renderTemplate(t.body, ctx); sync(); tpl.value = '';
    });

    const copy = async () => { sync(); try { await navigator.clipboard.writeText(draft.subject + '\n\n' + draft.body); toast('Copied'); } catch (e) { toast('Could not copy. Select the text and copy it.'); } };
    const mailto = () => { sync(); return 'mailto:' + encodeURIComponent(draft.to) + '?subject=' + encodeURIComponent(draft.subject) + '&body=' + encodeURIComponent(draft.body); };

    const saveDraft = () => {
      sync();
      if (!draft.subject.trim() && !draft.body.trim()) { toast('Nothing to save yet.'); return; }
      const saved = store.put('emails', { id: draft.id || undefined, status: 'draft', from: FROM, to: draft.to, subject: draft.subject, body: draft.body, leadId: draft.leadId, clientId: draft.clientId, scheduledFor: draft.scheduledFor, updatedAt: new Date().toISOString() });
      draft.id = saved.id; toast(draft.scheduledFor ? 'Draft saved, reminder set for ' + fmt.short(draft.scheduledFor + 'T12:00:00') : 'Draft saved');
    };

    const logSent = async () => {
      sync();
      if (!draft.to.trim() || !draft.subject.trim()) { toast('Add a recipient and a subject first.'); return; }
      const ok = await confirmBox({ title: 'Log this email as sent?', confirmText: 'Log as sent', lines: [
        'This only records it in the CRM. Send the real email from Zoho first.', ['From', FROM], ['To', draft.to], ['Subject', draft.subject]] });
      if (!ok) return;
      store.put('emails', { id: draft.id || undefined, status: 'sent', from: FROM, to: draft.to, subject: draft.subject, body: draft.body, leadId: draft.leadId, clientId: draft.clientId, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (lead) {
        const l = store.get('leads', lead.id);
        if (l.stage === 'outreach') store.put('leads', { ...l, followups: (l.followups || 0) + 1 });
        else if (['research', 'verified', 'drafted'].includes(l.stage)) store.put('leads', { ...l, stage: 'outreach', contactedAt: new Date().toISOString(), followups: 0 });
        store.log('Emailed ' + l.name + ': ' + draft.subject, 'lead:' + l.id);
      } else store.log('Emailed ' + draft.to + ': ' + draft.subject, client ? 'client:' + client.id : '');
      blank(); ui.folder = 'sent'; drawAll(); toast('Logged as sent');
    };

    const ready = resendReady();
    const sendNow = async () => {
      sync();
      if (!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) { toast('Add a recipient, subject and message first.'); return; }
      const ok = await confirmBox({ title: 'Send this email for real?', confirmText: 'Send', lines: [
        'This actually goes out through Resend, to a real inbox.', ['From', engineFrom()], ['To', draft.to], ['Subject', draft.subject]] });
      if (!ok) return;
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      try {
        await remote.fn('send-email', { to: draft.to, subject: draft.subject, body: draft.body, confirmed: true });
        store.put('emails', { id: draft.id || undefined, status: 'sent', from: FROM, to: draft.to, subject: draft.subject, body: draft.body, leadId: draft.leadId, clientId: draft.clientId, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        if (lead) {
          const l = store.get('leads', lead.id);
          if (l.stage === 'outreach') store.put('leads', { ...l, followups: (l.followups || 0) + 1 });
          else if (['research', 'verified', 'drafted'].includes(l.stage)) store.put('leads', { ...l, stage: 'outreach', contactedAt: new Date().toISOString(), followups: 0 });
          store.log('Sent to ' + l.name + ': ' + draft.subject, 'lead:' + l.id);
        } else store.log('Sent to ' + draft.to + ': ' + draft.subject, client ? 'client:' + client.id : '');
        blank(); ui.folder = 'sent'; drawAll(); toast('Sent');
      } catch (e) {
        toast('Send failed: ' + e.message);
        sendBtn.disabled = false; sendBtn.replaceChildren(icon('send', 16), 'Send from CRM');
      }
    };
    const sendBtn = h('button', {
      class: 'btn primary', type: 'button', disabled: (ready && MODE === 'remote') ? null : true,
      title: ready ? (MODE === 'remote' ? '' : 'Only works on the live site, not local preview') : 'Connect Resend in Settings first',
      onclick: sendNow
    }, icon('send', 16), 'Send from CRM');
    return h('form', { class: 'compose', onsubmit: e => e.preventDefault() },
      lead ? h('p', { class: 'context' }, pill('Lead', 'gold'), h('a', { href: '#/leads/' + lead.id, text: lead.name + ' · ' + lead.town }), lead.email ? null : pill('No email found. Add one below.', 'neutral')) : null,
      client ? h('p', { class: 'context' }, pill('Client'), h('a', { href: '#/clients/' + client.id, text: client.name })) : null,
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'From' }), h('div', { class: 'static', text: 'Kendall Clark <' + FROM + '>' })),
      field('To', to), people,
      h('div', { class: 'field' }, h('div', { class: 'actions' }, h('label', { for: tpl.id, text: 'Template' }),
        infoIcon('Templates can use {business}, {name}, {town} and {category}, filled in from the lead or client this draft is for. Wrap a line in {if town}...{endif} to only show it when that field is set, add {else}...{endif} for an alternate line otherwise.', 'templates')), tpl),
      field('Subject', subject), field('Message', body),
      h('div', { class: 'field' },
        h('div', { class: 'actions' }, h('span', { class: 'lbl', text: 'Schedule reminder (optional)' }),
          infoIcon('The CRM cannot send on its own yet, so this is a reminder, not an automatic send. Set a date and this draft shows up under Today on the Dashboard on or after that day, so a planned follow-up never gets lost.', 'scheduling')),
        scheduled),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn', type: 'button', onclick: () => { body.value = body.value.replace(/\s+$/, '') + (body.value.trim() ? '\n\n' : '') + SIGNATURE; sync(); } }, 'Add signature'),
        h('button', { class: 'btn', type: 'button', onclick: copy }, icon('copy', 16), 'Copy'),
        h('button', { class: 'btn', type: 'button', onclick: saveDraft }, 'Save draft'),
        h('a', { class: 'btn', href: '#', onclick: e => { e.preventDefault(); location.href = mailto(); } }, icon('external', 16), 'Open in mail app')),
      h('div', { class: 'actions wrap send-row' }, sendBtn,
        h('button', { class: 'btn accent', type: 'button', onclick: logSent }, icon('check', 16), 'Log as sent'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { blank(); drawPane(); } }, 'Clear')),
      h('p', { class: 'hint', text: ready ? 'Send from CRM goes out for real through Resend. Log as sent is still there for anything you send from Zoho or your phone instead.' : 'Nothing leaves the CRM from this screen yet. Send from Zoho or your mail app, then log it here so follow-ups stay on schedule. Connect Resend in Settings to send for real.' }));
  }

  /* ---------- lists ---------- */
  function outreach() {
    const rows = store.list('leads').filter(l => l.stage === 'drafted').sort((a, b) => (b.email ? 1 : 0) - (a.email ? 1 : 0) || a.name.localeCompare(b.name));
    return panel('Lead drafts ready to review', h('span', { class: 'muted small', text: rows.length + ' drafted' }),
      rows.length ? h('div', { class: 'list' }, rows.map(l => h('button', { class: 'list-item as-btn', type: 'button', onclick: () => { Object.assign(draft, { id: null, to: l.email || '', subject: l.subject, body: l.body, leadId: l.id, clientId: '', scheduledFor: '' }); ui.folder = 'compose'; drawAll(); } },
        h('div', { class: 'grow' }, h('strong', { text: l.name }), h('span', { class: 'muted small block clamp', text: l.subject })),
        l.email ? pill('Has email', 'good') : pill('No email', 'neutral'), icon('chevR', 16)))) : empty('No drafted leads. Draft one from the Leads tab.'));
  }
  function drafts() {
    const today = startOfDay(new Date());
    const rows = store.list('emails').filter(e => e.status === 'draft').sort((a, b) => {
      const da = a.scheduledFor, db = b.scheduledFor;
      if (da && db) return da.localeCompare(db);
      if (da || db) return da ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    const dueBadge = e => {
      if (!e.scheduledFor) return null;
      const due = new Date(e.scheduledFor + 'T00:00:00');
      return pill((due < today ? 'Overdue, was due ' : due.getTime() === today.getTime() ? 'Due today' : 'Due ') + (due.getTime() === today.getTime() ? '' : fmt.short(due)), due <= today ? 'gold' : 'neutral');
    };
    return panel('My drafts', null, rows.length ? h('div', { class: 'list' }, rows.map(e => h('div', { class: 'list-item' },
      h('button', { class: 'as-btn grow left', type: 'button', onclick: () => { Object.assign(draft, { id: e.id, to: e.to, subject: e.subject, body: e.body, leadId: e.leadId || '', clientId: e.clientId || '', scheduledFor: e.scheduledFor || '' }); ui.folder = 'compose'; drawAll(); } },
        h('strong', { text: e.subject || '(no subject)' }), h('span', { class: 'muted small block', text: (e.to || 'No recipient') + ' · saved ' + fmt.ago(e.updatedAt) })),
      dueBadge(e),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete draft', onclick: () => { store.del('emails', e.id); toast('Draft deleted'); } }, icon('trash', 16))))) : empty('No saved drafts.'));
  }
  function sent() {
    const rows = store.list('emails').filter(e => e.status === 'sent').sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    return panel('Sent log', h('span', { class: 'muted small', text: 'Recorded in the CRM' }), rows.length ? h('div', { class: 'list' }, rows.map(e => h('div', { class: 'list-item' },
      h('span', { class: 'when small', text: fmt.short(e.sentAt) }), h('div', { class: 'grow' }, h('strong', { text: e.subject }), h('span', { class: 'muted small block', text: 'To ' + e.to })),
      e.leadId ? h('a', { class: 'text-link', href: '#/leads/' + e.leadId, text: 'Lead' }) : e.clientId ? h('a', { class: 'text-link', href: '#/clients/' + e.clientId, text: 'Client' }) : null))) : empty('Nothing logged yet. After you send an email from Zoho, log it here.'));
  }
}

function status() {
  const ready = resendReady();
  return h('details', { class: 'callout status' },
    h('summary', null, pill(ready ? 'Sending on' : 'Sending off', ready ? 'good' : 'gold'),
      h('span', { text: ready ? ' Send from CRM goes out for real through Resend.' : ' Connect Resend in Settings to send for real. Here is the workflow until then.' })),
    h('ul', { class: 'bullets' },
      ready ? [
        h('li', { text: 'Send from CRM sends the real email through Resend, from the address you saved in Settings, and logs it here automatically.' }),
        h('li', { text: 'Log as sent is still there for anything you actually send from Zoho Mail or your phone instead, so the pipeline stays accurate either way.' }),
      ] : [
        h('li', { text: 'Zoho\'s free plan does not include SMTP, the connection a CRM needs to send mail on your behalf. It also has no IMAP or POP, so there is nothing to plug the CRM into.' }),
        h('li', { text: 'Your workflow until Resend is connected: write and review here, press Copy, send from Zoho Mail on the web or in its phone app, then press Log as sent. That keeps stages and follow-up dates accurate.' }),
        h('li', { text: 'To make Open in mail app useful: in Zoho Mail, set Zoho as your browser\'s default email composer. Those links then open a Zoho compose window with the recipient and subject filled in. The message body may not carry over, so press Copy first.' }),
        h('li', { text: 'Real push-button sending: go to Settings > Integrations > Resend, add your API key and verified from-address.' }),
      ]));
}
