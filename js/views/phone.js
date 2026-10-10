import { h, icon, pill, textarea, input, confirmBox, toast, empty, uid } from '../ui.js';
import { store, MODE } from '../store.js';
import * as remote from '../remote.js';
import { WEB, CALL_OUTCOMES, bestTimeHint } from '../model.js';

const BUCKET = 'call-recordings';
const scriptCache = {};

/* Never-called and mid-outreach leads first, quietest ones last. Snapshotted once per
   session (see buildQueue) rather than live-recomputed, so logging an outcome always moves
   forward instead of the list reshuffling under you mid-call. */
const priority = l => l.stage === 'outreach' ? 0 : l.stage === 'interested' ? 1 : (l.stage === 'drafted' || l.stage === 'verified') ? 2 : 3;
const eligible = l => !!l.phone && !l.doNotCall && l.stage !== 'won' && l.stage !== 'declined';

export function mount(root) {
  let queueIds = [];
  let idx = 0;
  let timerStart = null;
  let timerHandle = null;

  function buildQueue() {
    queueIds = store.list('leads').filter(eligible)
      .sort((a, b) => priority(a) - priority(b) || new Date(a.lastCallAt || a.createdAt || 0) - new Date(b.lastCallAt || b.createdAt || 0))
      .map(l => l.id);
    idx = 0;
  }
  buildQueue();

  const page = h('div', { class: 'page' });
  root.append(page);

  /* ---------- timer ---------- */
  function resetTimer() { timerStart = Date.now(); }
  function timerText() {
    const s = Math.max(0, Math.floor((Date.now() - (timerStart || Date.now())) / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- script generation ---------- */
  function scriptPrompt(l) {
    return 'Write a cold call phone script for this local business. Return EXACTLY this format, nothing else, no markdown:\n\n' +
      'LIVE:\n<one line opener>\n- <talking point 1>\n- <talking point 2>\n- <talking point 3, optional>\n\n' +
      'VOICEMAIL:\n<3 to 4 sentences max, shorter than the live version, ends with a clear callback reason and the name and number to call back>\n\n' +
      'Business: ' + l.name + '\nCategory: ' + l.category + '\nTown: ' + l.town + '\n' +
      'What we found: ' + (l.observation || 'not recorded') + '\nStatus: ' + (WEB[l.webStatus] || l.webStatus) + '\n\n' +
      'Rules: no em dashes, no filler words (seamless, leverage, robust, cutting-edge, game-changer, unlock, delve), plain spoken language meant to be glanced at while dialing, not read verbatim. Professional and down to earth, not hype-y, no exclamation points. Lead with what the problem is actually costing them before the ask. One call to action: a quick 5 to 10 minute call this week. Sign off with Kendall, Towpath Creative, (267) 640-1030 in the voicemail only. Write this specific business, not a fill-in-the-blank template: build the opener around the one real detail in "What we found" above rather than a generic line, and do not reuse the same opener phrasing or the same Nina’s Cleaning Service reference every single call, this is one of many calls today and each one should sound like it was actually written for that business.';
  }
  function parseScript(text) {
    const live = /LIVE:\s*([\s\S]*?)(?:\n\s*VOICEMAIL:|$)/i.exec(text);
    const vm = /VOICEMAIL:\s*([\s\S]*)$/i.exec(text);
    return { live: (live && live[1].trim()) || text.trim(), voicemail: (vm && vm[1].trim()) || '' };
  }
  async function generateScript(l) {
    if (MODE !== 'remote') return { live: 'Local preview cannot reach the model. This only works on the live site.', voicemail: '' };
    const s = store.get('settings', 'app');
    if (!s || !s.provider || !s.model) return { live: 'No model is set yet. Pick one in Settings, then come back.', voicemail: '' };
    try {
      const res = await remote.fn('agent-chat', {
        provider: s.provider, model: s.model,
        agent: { title: 'Cold Call Script Writer', dept: 'Sales', blurb: 'Writes short phone scripts for Towpath’s cold calls, one lead at a time.' },
        history: [], message: scriptPrompt(l)
      });
      return parseScript(res.reply);
    } catch (e) {
      return { live: 'Could not generate a script: ' + e.message, voicemail: '' };
    }
  }

  /* ---------- outcomes ---------- */
  function logOutcome(l, outcomeId) {
    const now = new Date().toISOString();
    const callLog = [...(l.callLog || []), { id: uid(), at: now, outcome: outcomeId }];
    const changes = { callLog, lastCallAt: now, lastCallOutcome: outcomeId };
    if (outcomeId === 'interested') { changes.stage = 'interested'; if (!l.contactedAt) changes.contactedAt = now; }
    else if (outcomeId === 'not_interested') { changes.stage = 'declined'; }
    else if (outcomeId === 'do_not_call') { changes.stage = 'declined'; changes.doNotCall = true; }
    else if (outcomeId === 'talked') { if (['drafted', 'verified', 'research'].includes(l.stage)) { changes.stage = 'outreach'; if (!l.contactedAt) changes.contactedAt = now; } }
    else if (outcomeId === 'voicemail' || outcomeId === 'no_answer') {
      if (['drafted', 'verified'].includes(l.stage)) { changes.stage = 'outreach'; if (!l.contactedAt) changes.contactedAt = now; }
      else if (l.stage === 'outreach') { changes.followups = (l.followups || 0) + 1; }
    }
    store.put('leads', { ...store.get('leads', l.id), ...changes });
    store.log((CALL_OUTCOMES.find(o => o.id === outcomeId) || {}).label + ': ' + l.name, 'lead:' + l.id);
    idx += 1;
    render();
  }

  /* ---------- recordings ---------- */
  async function uploadRecording(l, file) {
    const path = l.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    try {
      await remote.uploadFile(BUCKET, path, file);
      const rec = { id: uid(), path, name: file.name, uploadedAt: new Date().toISOString() };
      store.put('leads', { ...store.get('leads', l.id), recordings: [...(l.recordings || []), rec] });
      toast('Recording uploaded. Transcribe it next time you’re at your Mac.');
      render();
    } catch (e) { toast('Upload failed: ' + e.message); }
  }
  async function playRecording(rec) {
    try { window.open(await remote.signedUrl(BUCKET, rec.path), '_blank'); }
    catch (e) { toast('Could not open recording: ' + e.message); }
  }

  /* ---------- render ---------- */
  function render() {
    page.replaceChildren();
    page.append(h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'Phone' }), h('h1', { text: 'Call the queue' }),
        h('p', { class: 'muted', text: 'One lead at a time. Log the outcome and it moves you straight to the next.' }))));

    if (idx >= queueIds.length) {
      page.append(empty(queueIds.length ? 'Queue complete for this session.' : 'No leads ready to call right now (need a phone number, not won or declined).',
        h('button', { class: 'btn primary', type: 'button', onclick: () => { buildQueue(); render(); } }, 'Rebuild queue')));
      return;
    }

    const l = store.get('leads', queueIds[idx]);
    if (!l) { idx += 1; render(); return; }

    resetTimer();
    clearInterval(timerHandle);
    const timerEl = h('span', { class: 'muted small num', text: timerText() });
    timerHandle = setInterval(() => { timerEl.textContent = timerText(); }, 1000);

    const key = l.id;
    const scriptBox = h('div', { class: 'callout' });
    const vmBox = h('div', { class: 'callout' });
    function renderBoth(s) {
      scriptBox.replaceChildren(
        h('p', { class: 'small', style: 'white-space:pre-wrap', text: s.live }),
        h('button', { class: 'btn small', type: 'button', onclick: loadScript }, icon('spark', 14), 'Regenerate'));
      vmBox.replaceChildren(h('p', { class: 'small', style: 'white-space:pre-wrap', text: s.voicemail || 'Not generated.' }));
    }
    async function loadScript() {
      scriptBox.replaceChildren(h('p', { class: 'muted small', text: 'Generating script…' }));
      vmBox.replaceChildren(h('p', { class: 'muted small', text: 'Generating…' }));
      const s = await generateScript(l);
      scriptCache[key] = s;
      if (queueIds[idx] === key) renderBoth(s);
    }
    if (scriptCache[key]) renderBoth(scriptCache[key]); else loadScript();

    const notes = textarea({ rows: 3, placeholder: 'Notes while you talk', 'aria-label': 'Call notes' }, l.notes || '');
    notes.addEventListener('change', () => { store.put('leads', { ...store.get('leads', l.id), notes: notes.value }); toast('Notes saved'); });

    const fileIn = input({ type: 'file', accept: 'audio/*', 'aria-label': 'Upload call recording' });
    fileIn.addEventListener('change', () => { if (fileIn.files[0]) uploadRecording(l, fileIn.files[0]); });

    const card = h('div', { class: 'card', style: 'gap:14px;padding:16px' },
      h('div', { class: 'actions', style: 'justify-content:space-between' },
        h('span', { class: 'muted small', text: (idx + 1) + ' of ' + queueIds.length }),
        timerEl),

      h('div', null, h('h2', { text: l.name }), h('p', { class: 'muted', text: [l.category, l.town].filter(Boolean).join(' · ') })),
      h('div', { class: 'pills' }, pill(WEB[l.webStatus] || l.webStatus, 'neutral'), l.lastCallOutcome ? pill('Last: ' + ((CALL_OUTCOMES.find(o => o.id === l.lastCallOutcome) || {}).label || l.lastCallOutcome), 'neutral') : null),
      l.observation ? h('p', { class: 'small', text: l.observation }) : null,
      h('p', { class: 'muted small', text: bestTimeHint(l) }),

      l.phone
        ? h('a', { class: 'btn primary block', href: 'tel:' + l.phone.replace(/[^\d+]/g, ''), onclick: resetTimer }, icon('phone', 18), l.phone)
        : h('p', { class: 'muted small', text: 'No phone number on this lead.' }),

      section('Live script', scriptBox),
      section('Voicemail script', vmBox),
      section('Notes', notes),
      section('Recording', fileIn,
        (l.recordings || []).length ? h('div', { class: 'list' }, l.recordings.map(r =>
          h('button', { class: 'list-item as-btn', type: 'button', onclick: () => playRecording(r) }, icon('external', 14), r.name))) : null,
        h('p', { class: 'hint', text: 'Use your phone’s own call recording (announces to the other side automatically on recent iOS/Android, which covers Pennsylvania’s two-party consent rule), then upload it here. Transcription happens locally on your Mac, not instantly on your phone.' })),

      h('div', { class: 'actions wrap' }, CALL_OUTCOMES.map(o =>
        h('button', { class: 'btn small' + (o.id === 'do_not_call' || o.id === 'not_interested' ? ' danger-outline' : ''), type: 'button', onclick: () => confirmOutcome(l, o) }, o.label))),

      h('div', { class: 'actions wrap' },
        h('a', { class: 'btn small', href: '#/email?lead=' + l.id }, icon('mail', 14), 'Email instead'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { idx += 1; render(); } }, 'Skip for now')));

    page.append(card);
  }

  async function confirmOutcome(l, o) {
    if (o.id === 'do_not_call' || o.id === 'not_interested') {
      if (!(await confirmBox({ title: o.label + '?', lines: [l.name], confirmText: o.label, danger: true }))) return;
    }
    logOutcome(l, o.id);
  }

  const section = (title, ...kids) => h('section', { class: 'dsec' }, h('h3', { text: title }), ...kids);

  render();
  const off = store.sub(c => { if (c === 'settings') render(); });
  return () => { clearInterval(timerHandle); off(); };
}
