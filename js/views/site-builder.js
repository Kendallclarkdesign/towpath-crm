/* Site Builder: turn call notes into a finished-looking one-page preview site and a live,
   publishable link, fast enough to send before you're off the phone. Standalone tool, not
   tied to a specific lead record, on purpose: type in whatever business you just talked to.

   The preview is directly editable (click any text, retype it) and selecting a sentence
   offers an AI rewrite of just that selection. That editing runs via a small script we inject
   into the generated page itself, talking back to this page only through postMessage - the
   iframe stays sandboxed without allow-same-origin, so even if the AI's own output included a
   stray script, it still can't reach this app's storage, cookies, or parent window. */
import { h, icon, field, input, select, textarea, toast, empty, fmt } from '../ui.js';
import { store } from '../store.js';
import * as remote from '../remote.js';
import { wireRequest } from './settings.js';

/* A named, specific design direction fights "AI slop" far better than asking the model to
   "look nice" — vague instructions are exactly what produce the same generic template every
   time. Each one spells out palette, type pairing (system fonts only, matches generate-site's
   own rules) and layout personality so the result actually looks different per style.
   Bento Grid Modern and Glass & Blur are pulled from a 2026-10 check of current design-trend
   coverage (bento layouts, glassmorphism, restrained dark-luxury with one strong visual moment
   instead of many small effects) rather than invented, and the rest are sharpened against the
   same research: what's actually losing right now is generic particle/gradient-blob templates,
   so every directive below names a specific, checkable technique instead of "modern and clean." */
const STYLES = [
  { id: 'modern-minimal', label: 'Modern Minimal', mood: 'Professional',
    directive: 'Scandinavian minimalism: lots of white/cream negative space, one confident saturated accent color, thin-weight sans-serif headlines (system-ui, "Helvetica Neue", Arial), generous line-height, no decorative clutter, understated elegance.' },
  { id: 'bento-modern', label: 'Bento Grid Modern', mood: 'Professional',
    directive: 'Apple-style modular bento grid: a CSS grid of varied-size rounded rectangular tiles (one per stat, service, quote or highlight), generous rounded corners and soft shadows, one confident accent color, lots of breathing room between tiles. Reads as a 2026 product-launch page, not a stack of full-width sections.' },
  { id: 'glass-blur', label: 'Glass & Blur', mood: 'Professional',
    directive: 'Glassmorphism: a sticky translucent header built with backdrop-filter: blur over a soft layered gradient-mesh background (several overlapping CSS radial-gradients, no images), frosted semi-transparent cards with thin light borders, airy and light. The current high-end SaaS look.' },
  { id: 'corporate-trust', label: 'Corporate Trust', mood: 'Professional',
    directive: 'Buttoned-up professional-services look: navy and slate palette with a single warm gold or amber accent, structured even grid, clean sans-serif (system-ui, "Segoe UI"), icon-led feature list, the kind of site a law firm or financial advisor would be proud of, zero playfulness.' },
  { id: 'quiet-craft', label: 'Quiet Craft', mood: 'Professional',
    directive: 'Understated, handcrafted trade-business feel: muted earthy or stone palette, straightforward honest typography (system-ui or Georgia), a simple clean layout that puts the work itself front and center rather than flashy design, trustworthy and unpretentious, a good fit for contractors, repair, or home services.' },
  { id: 'bold-editorial', label: 'Bold Editorial', mood: 'Creative',
    directive: 'Magazine-style editorial: oversized kinetic headline type with dramatic size contrast between a huge display line and small body text (Georgia or "Times New Roman" at a huge size, or a bold condensed sans like Arial Black for contrast), asymmetric layout on a strong grid, one loud accent color against black and white, pull-quote callouts, confident and a little irreverent.' },
  { id: 'warm-artisan', label: 'Warm Artisan', mood: 'Creative',
    directive: 'Handmade, small-batch warmth: earthy palette of terracotta, cream, sage green and warm browns, a serif or slab-serif display font (Georgia or ui-serif) for headlines paired with a soft sans body, organic blob shapes instead of sharp rectangles, feels like a bakery, florist, or craft studio.' },
  { id: 'dark-luxury', label: 'Dark Luxury', mood: 'Creative',
    directive: 'Restrained high-end luxury, the way current award-winning sites actually do it: near-black charcoal background, a single metallic gold or copper accent used sparingly, one strong visual moment (a dramatic headline treatment or a single glowing shape) rather than many small effects, elegant serif headlines, generous negative space, confidence through restraint not volume.' },
  { id: 'playful-startup', label: 'Playful Startup', mood: 'Fun',
    directive: 'Friendly startup energy: bright saturated complementary colors, organic blob shapes and big rounded corners everywhere, a chunky rounded sans-serif (system-ui, "Segoe UI"), a big friendly headline, approachable and upbeat, visual energy from color blocking rather than photos.' },
  { id: 'retro-pop', label: 'Retro Pop', mood: 'Fun',
    directive: 'Nostalgic diner-poster energy: high-contrast saturated colors like mustard yellow, cherry red and cream, thick borders and chunky shapes, a bold condensed display font for headlines (Arial Black / Impact feel), playful tilted elements, great for food, entertainment, or anything that wants to feel fun and a little loud.' }
];

const EDITOR_SCRIPT = `
<script>
(function () {
  document.body.contentEditable = 'true';
  document.body.style.outline = 'none';
  var lastRange = null;
  function reportSelection() {
    var sel = window.getSelection();
    var text = sel && sel.rangeCount ? sel.toString() : '';
    if (text && text.trim()) { lastRange = sel.getRangeAt(0); parent.postMessage({ type: 'crm-selection', text: text.trim() }, '*'); }
    else { parent.postMessage({ type: 'crm-selection', text: '' }, '*'); }
  }
  document.addEventListener('mouseup', reportSelection);
  document.addEventListener('keyup', reportSelection);
  window.addEventListener('message', function (e) {
    var msg = e.data || {};
    if (msg.type === 'crm-apply' && lastRange) {
      lastRange.deleteContents();
      lastRange.insertNode(document.createTextNode(msg.text));
      lastRange = null;
      parent.postMessage({ type: 'crm-applied' }, '*');
    } else if (msg.type === 'crm-request-html') {
      parent.postMessage({ type: 'crm-html', html: document.documentElement.outerHTML }, '*');
    }
  });
})();
</script>`;

function injectEditor(rawHtml) {
  return /<\/body>/i.test(rawHtml) ? rawHtml.replace(/<\/body>/i, EDITOR_SCRIPT + '</body>') : rawHtml + EDITOR_SCRIPT;
}

export function mount(root) {
  const page = h('div', { class: 'page' });
  root.append(page);

  const nameIn = input({ required: true, placeholder: 'e.g. Crown & Blade Barbershop', list: 'business-suggestions' });
  const businessList = h('datalist', { id: 'business-suggestions' },
    [...new Set(store.list('leads').map(l => l.name).filter(Boolean))].sort().map(n => h('option', { value: n })));
  const contactIn = input({ placeholder: 'Phone, email, or address to show (optional)' });
  const notesIn = textarea({ rows: 8, placeholder: 'Everything worth using: what they do, service area, what they liked, what is wrong with their current site, anything that should feel personal to them.' }, '');
  const researchBtn = h('button', { class: 'btn small', type: 'button', onclick: research }, icon('search', 14), 'Research on Google ↗');
  const styleSel = select([['random', 'Surprise me (random style)'], ...STYLES.map(s => [s.id, s.label + ' — ' + s.mood])], 'random', { 'aria-label': 'Design style' });

  nameIn.addEventListener('change', () => {
    const lead = store.list('leads').find(l => l.name === nameIn.value.trim());
    if (lead && !contactIn.value.trim()) contactIn.value = [lead.phone, lead.town].filter(Boolean).join(' · ');
  });

  function research() {
    const name = nameIn.value.trim();
    if (!name) { genStatus.textContent = 'Add a business name first.'; nameIn.focus(); return; }
    const lead = store.list('leads').find(l => l.name === name);
    const q = [name, lead && lead.town, lead && lead.category, 'reviews'].filter(Boolean).join(' ');
    window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener');
  }

  let html = '', liveUrl = '', generating = false, publishing = false, lastStyleLabel = '';
  let currentFrame = null, selectedText = '', rewriting = false;

  const genStatus = h('p', { class: 'muted small', role: 'status' });
  const genBtn = h('button', { class: 'btn primary', type: 'button', onclick: generate }, icon('spark', 16), 'Generate preview site');
  const previewPanel = h('div', { class: 'stack' });
  const settingsNotice = notConnectedNotice();

  page.append(
    h('div', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow', text: 'Site Builder' }), h('h1', { text: 'Quick preview sites' }),
        h('p', { class: 'muted', text: 'Type in what you just learned on the call, generate a finished-looking one-pager, and publish a real link to text or email right away.' }))),
    settingsNotice,
    h('section', { class: 'panel' },
      h('div', { class: 'pad stack' },
        field('Business name', nameIn), businessList,
        h('div', { class: 'actions' }, researchBtn, h('span', { class: 'muted small', text: 'Opens a Google search in a new tab, including its AI Overview if there is one, so you can skim it and copy anything useful into Notes.' })),
        field('Contact info to show', contactIn, 'Only what you type here appears on the page, nothing is invented.'),
        field('Design style', styleSel, 'A specific style keeps every site from looking like the same generic template.'),
        field('Notes & research', notesIn),
        h('div', { class: 'actions wrap' }, genBtn, genStatus))),
    previewPanel,
    h('section', { class: 'panel' }, h('header', { class: 'panel-head' }, h('h2', { text: 'Recent previews' })), h('div', { id: 'preview-history' })));

  /* ---------- cross-frame messaging with the preview's own injected editor script ---------- */
  function onFrameMessage(e) {
    if (!currentFrame || e.source !== currentFrame.contentWindow) return;
    const msg = e.data || {};
    if (msg.type === 'crm-selection') { selectedText = msg.text || ''; renderSelectionBar(); }
  }
  window.addEventListener('message', onFrameMessage);

  function getLatestHtml() {
    return new Promise(resolve => {
      if (!currentFrame) return resolve(html);
      let done = false;
      const onMsg = e => {
        if (e.source === currentFrame.contentWindow && e.data && e.data.type === 'crm-html') {
          done = true; window.removeEventListener('message', onMsg); resolve(e.data.html);
        }
      };
      window.addEventListener('message', onMsg);
      currentFrame.contentWindow.postMessage({ type: 'crm-request-html' }, '*');
      setTimeout(() => { if (!done) { window.removeEventListener('message', onMsg); resolve(html); } }, 800);
    });
  }

  async function rewriteSelected(hintIn) {
    const s = store.get('settings', 'app');
    if (!s || !s.provider || !s.engines || !s.engines[s.provider] || !s.engines[s.provider].enabled) { toast('Turn on an engine in Settings first.'); return; }
    rewriting = true; renderSelectionBar();
    try {
      const payload = wireRequest(s.provider, s.model, s.engines, { snippet: selectedText, instruction: hintIn.value.trim() });
      const res = await remote.fn('rewrite-text', payload);
      currentFrame.contentWindow.postMessage({ type: 'crm-apply', text: res.text }, '*');
      selectedText = ''; toast('Updated');
    } catch (e) {
      toast('Rewrite failed: ' + e.message);
    }
    rewriting = false; renderSelectionBar();
  }

  function renderSelectionBar() {
    const bar = page.querySelector('#selection-bar');
    if (!bar) return;
    if (!selectedText) { bar.replaceChildren(); return; }
    const hintIn = input({ class: 'small', placeholder: 'Optional: tell it what to change, e.g. "make it punchier"' });
    bar.replaceChildren(h('div', { class: 'site-result' },
      h('p', { class: 'muted small', text: 'Selected: "' + (selectedText.length > 90 ? selectedText.slice(0, 90) + '…' : selectedText) + '"' }),
      h('div', { class: 'actions wrap' }, hintIn,
        h('button', { class: 'btn small primary', type: 'button', disabled: rewriting, onclick: () => rewriteSelected(hintIn) }, icon('spark', 14), rewriting ? 'Rewriting…' : 'AI rewrite'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { selectedText = ''; renderSelectionBar(); } }, 'Dismiss'))));
  }

  function notConnectedNotice() {
    const s = store.get('settings', 'app');
    const engineOn = !!(s && s.provider && s.engines && s.engines[s.provider] && s.engines[s.provider].enabled);
    const netlifyOn = !!(s && s.engines && s.engines.netlify && s.engines.netlify.enabled && s.engines.netlify.apiToken);
    if (engineOn && netlifyOn) return null;
    const missing = [!engineOn && 'an AI engine', !netlifyOn && 'Netlify'].filter(Boolean).join(' and ');
    return h('div', { class: 'callout' },
      h('p', { text: 'Connect ' + missing + ' in Settings before generating and publishing sites here.' }),
      h('a', { class: 'text-link', href: '#/settings', text: 'Open Settings →' }));
  }

  async function generate() {
    const name = nameIn.value.trim(), notes = notesIn.value.trim();
    if (!name) { genStatus.textContent = 'Add a business name first.'; nameIn.focus(); return; }
    if (!notes) { genStatus.textContent = 'Add some notes, that is what makes it feel personal.'; notesIn.focus(); return; }
    const s = store.get('settings', 'app');
    if (!s || !s.provider || !s.engines || !s.engines[s.provider] || !s.engines[s.provider].enabled) {
      genStatus.textContent = 'Turn on an engine in Settings first.'; return;
    }
    generating = true; genBtn.disabled = true; genStatus.textContent = 'Generating… usually 10–20 seconds.';
    liveUrl = ''; selectedText = ''; renderPreview();
    const style = STYLES[styleSel.value === 'random' ? Math.floor(Math.random() * STYLES.length) : STYLES.findIndex(s => s.id === styleSel.value)];
    const brief = [
      'Design style to use: ' + style.label + ' — ' + style.directive,
      'Business name: ' + name,
      contactIn.value.trim() ? 'Contact info to display: ' + contactIn.value.trim() : '',
      'Notes and research from the call:',
      notes
    ].filter(Boolean).join('\n');
    try {
      const payload = wireRequest(s.provider, s.model, s.engines, { brief });
      const res = await remote.fn('generate-site', payload);
      html = res.html; lastStyleLabel = style.label;
      genStatus.textContent = 'Generated in the "' + style.label + '" style. Click any text below to edit it, select a sentence for an AI rewrite, then publish when ready.';
      renderPreview();
    } catch (e) {
      genStatus.textContent = 'Failed: ' + e.message;
    }
    generating = false; genBtn.disabled = false;
  }

  async function publish() {
    publishing = true; renderPreview();
    try {
      html = await getLatestHtml();
      const res = await remote.fn('publish-site', { html, name: nameIn.value.trim() });
      liveUrl = res.url;
      saveHistory(liveUrl, res.siteId);
      toast('Published, link ready to send');
    } catch (e) {
      toast('Publish failed: ' + e.message);
    }
    publishing = false; renderPreview();
  }

  function renderPreview() {
    if (!html) { previewPanel.replaceChildren(); currentFrame = null; return; }
    const frame = h('iframe', { class: 'site-frame', title: 'Preview', sandbox: 'allow-scripts allow-popups allow-forms' });
    frame.srcdoc = injectEditor(html);
    currentFrame = frame;
    const kids = [h('section', { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h2', { text: 'Preview' }),
        h('div', { class: 'actions' },
          liveUrl ? null : h('button', { class: 'btn primary small', type: 'button', disabled: publishing, onclick: publish }, publishing ? 'Publishing…' : 'Publish live link'))),
      h('div', { class: 'pad stack' },
        h('p', { class: 'hint', text: 'Click directly into the preview to edit any text. Select a sentence to get an AI rewrite of just that part.' }),
        h('div', { id: 'selection-bar' }),
        frame))];
    if (liveUrl) kids.push(h('div', { class: 'site-result' },
      h('div', { class: 'kv' }, h('span', { class: 'k', text: 'Live link' }), h('a', { href: liveUrl, target: '_blank', rel: 'noopener', text: liveUrl })),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { navigator.clipboard.writeText(liveUrl).then(() => toast('Link copied')); } }, icon('copy', 14), 'Copy link'),
        h('a', { class: 'btn small', href: 'sms:&body=' + encodeURIComponent('Made you a quick preview of what a new site could look like: ' + liveUrl) }, 'Text it'),
        h('a', { class: 'btn small', href: 'mailto:?subject=' + encodeURIComponent('A quick preview for ' + nameIn.value.trim()) + '&body=' + encodeURIComponent('Here’s a quick preview of what a new site could look like:\n\n' + liveUrl) }, 'Email it'))));
    previewPanel.replaceChildren(...kids);
  }

  function saveHistory(url, siteId) {
    store.put('site_previews', {
      businessName: nameIn.value.trim(), contact: contactIn.value.trim(), notes: notesIn.value.trim(),
      style: lastStyleLabel, html, url, siteId, createdAt: new Date().toISOString()
    });
  }

  function renderHistory() {
    const wrap = page.querySelector('#preview-history');
    if (!wrap) return;
    const rows = store.list('site_previews').slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    wrap.replaceChildren(rows.length
      ? h('div', { class: 'preview-list' }, rows.map(p => h('div', { class: 'preview-row' },
          h('div', { class: 'grow' }, h('strong', { text: p.businessName }), h('span', { class: 'muted small block', text: [p.style, fmt.ago(p.createdAt)].filter(Boolean).join(' · ') })),
          p.url ? h('a', { class: 'btn small', href: p.url, target: '_blank', rel: 'noopener' }, icon('external', 14), 'Open') : h('span', { class: 'muted small', text: 'Not published' }),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => reload(p) }, 'Reload'))))
      : empty('No previews generated yet.'));
  }

  function reload(p) {
    nameIn.value = p.businessName || ''; contactIn.value = p.contact || ''; notesIn.value = p.notes || '';
    html = p.html || ''; liveUrl = p.url || ''; selectedText = ''; lastStyleLabel = p.style || '';
    const match = STYLES.find(s => s.label === p.style);
    if (match) styleSel.value = match.id;
    genStatus.textContent = html ? 'Loaded from history. Generate again to refresh, or publish as-is.' : '';
    renderPreview();
    window.scrollTo(0, 0);
  }

  renderHistory();
  const off = store.sub(c => { if (c === 'site_previews' || c === 'settings' || c === '*') renderHistory(); });
  return () => { off(); window.removeEventListener('message', onFrameMessage); };
}
