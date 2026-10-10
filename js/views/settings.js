import { h, icon, field, input, select, panel, infoIcon, toast, pill, empty } from '../ui.js';
import { store, MODE } from '../store.js';
import * as remote from '../remote.js';

/* One entry per engine the app can call out to. Model names checked against
   github.com/Krushnaapatil/free-llm-api-resources (auto-generated from each provider's own
   model list, not hand-maintained, so it stays current), rate limits change often, that repo
   is the place to check them, not this file.
   Open-weight families (Llama 4, DeepSeek, Gemma, Kimi, GLM) checked 2026-09-22: OpenRouter's
   free tier currently has DeepSeek V4 Flash and Gemma 4. It does not currently list a free
   Llama 4, and Groq's own docs did not show Llama 4 Scout when checked directly even though
   one tracker listed it, so that is deliberately left out rather than guessed, check
   console.groq.com/docs/models yourself for the current exact id. Kimi is not free on any of
   those four, Cloudflare Workers AI hosts it free instead (10,000 requests/day), see the Kimi
   card below. Newer GLM builds aren't free anywhere yet either, use the Custom card for those
   once they are (same Cloudflare-style OpenAI-compatible base URL pattern).

   The edge function (agent-chat) only knows how to reach five wire providers: gemini, groq,
   openrouter, cerebras, custom. A card's `id` is its own storage slot (so Kimi and the generic
   Custom card can be configured independently), `wireProvider` is what actually gets sent to
   the edge function, it defaults to the card's own id and only differs for cards, like Kimi,
   that ride on the generic `custom` wire path with a specific base URL filled in for you. */
const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', signupUrl: 'https://aistudio.google.com/apikey',
    steps: ['Go to aistudio.google.com/apikey', 'Sign in with any Google account', 'Click "Create API key"', 'Copy the key and paste it below'],
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] },
  { id: 'groq', label: 'Groq', signupUrl: 'https://console.groq.com/keys',
    steps: ['Go to console.groq.com/keys', 'Sign up or log in, no credit card needed', 'Click "Create API Key"', 'Give it any name and click Submit', 'Copy the key, you will not see it again, and paste it below'],
    models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'] },
  { id: 'openrouter', label: 'OpenRouter', signupUrl: 'https://openrouter.ai/keys',
    steps: ['Go to openrouter.ai/keys', 'Sign up or log in', 'Click "Create Key"', 'Name it anything and click Create', 'Copy the key and paste it below'],
    models: ['z-ai/glm-4.5-air:free', 'google/gemma-4-31b-it:free', 'meta-llama/llama-3.3-70b-instruct:free'] },
  { id: 'cerebras', label: 'Cerebras', signupUrl: 'https://cloud.cerebras.ai/',
    steps: ['Go to cloud.cerebras.ai and sign up, no credit card needed', 'Open the API Keys section', 'Click "Create API Key"', 'Copy the key and paste it below'],
    models: ['gpt-oss-120b'] },
  { id: 'kimi', label: 'Kimi (Cloudflare Workers AI)', wireProvider: 'custom', accountIdMode: true,
    signupUrl: 'https://dash.cloudflare.com/sign-up/workers-ai',
    steps: [
      'Go to dash.cloudflare.com and sign up, no credit card needed',
      'On your dashboard, copy the Account ID shown in the right sidebar',
      'Go to My Profile > API Tokens > Create Token, use the "Workers AI" template (or grant Workers AI Read only)',
      'Paste your Account ID and the token below',
      'Free tier is 10,000 Workers AI requests a day, checked 2026-09-22'
    ],
    models: ['@cf/moonshotai/kimi-k2.6'] },
  { id: 'custom', label: 'Custom (any OpenAI-compatible API)', signupUrl: '',
    steps: ['Find the base URL and an API key from whatever provider you are using', 'Paste the base URL and key below', 'Type the exact model name that provider expects, check its docs'],
    models: [] }
];
const emptyEngine = () => ({ enabled: false, apiKey: '', baseUrl: '', accountId: '', label: '' });
const cfBaseUrl = accountId => 'https://api.cloudflare.com/client/v4/accounts/' + accountId.trim() + '/ai/v1';

/* What actually gets sent to the agent-chat edge function for a given card id. The edge
   function validates `customBaseUrl` itself (https only, no localhost or private ranges),
   this just forwards the base URL each card already computed and saved. `settingsId` is the
   card's own id (e.g. 'kimi'), separate from `provider` (the wire protocol, e.g. 'custom')
   the edge function uses BASE_URLS with, so cards riding the custom wire path still get their
   own saved API key instead of the generic Custom card's. */
export function wireRequest(providerId, modelName, engines, extra) {
  const meta = PROVIDERS.find(p => p.id === providerId);
  const wireProvider = (meta && meta.wireProvider) || providerId;
  const payload = { provider: wireProvider, settingsId: providerId, model: modelName, ...extra };
  if (wireProvider === 'custom') payload.customBaseUrl = ((engines || {})[providerId] || {}).baseUrl;
  return payload;
}
const DEFAULT = { id: 'app', provider: 'gemini', model: '', engines: Object.fromEntries(PROVIDERS.map(p => [p.id, emptyEngine()])) };
const maskKey = k => (k.length <= 8 ? '••••••••' : k.slice(0, 4) + '••••••••' + k.slice(-4));

/* Separate from PROVIDERS above: these aren't chat-completion engines you pick as the
   "Active model", they're one-off service connections (real email sending, real calling).
   Each one's own fields, stored in the same s.engines bag as the LLM keys. */
const INTEGRATIONS = [
  { id: 'resend', label: 'Resend (real email sending)', signupUrl: 'https://resend.com/api-keys',
    steps: ['Go to resend.com and sign up', 'Verify a sending domain under Domains (adds a few DNS records at your registrar)', 'Create an API key under API Keys', 'Paste the key and your verified from-address below'],
    fields: [
      { key: 'apiKey', label: 'API key', type: 'password', placeholder: 're_...' },
      { key: 'fromEmail', label: 'Send from', type: 'text', placeholder: 'you@yourdomain.com' }
    ] },
  { id: 'twilio', label: 'Twilio (real voice calling)', signupUrl: 'https://console.twilio.com',
    steps: ['Go to console.twilio.com', 'Copy your Account SID and Auth Token from the dashboard', 'Buy or use a Twilio phone number to call from', 'Upgrade past the free trial before calling real lead numbers, trial accounts can only call numbers verified in the console'],
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'AC...' },
      { key: 'authToken', label: 'Auth token', type: 'password', placeholder: '' },
      { key: 'phoneNumber', label: 'Twilio number to call from', type: 'text', placeholder: '+1...' }
    ] },
  { id: 'netlify', label: 'Netlify (publish preview sites live)', signupUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
    steps: ['Go to app.netlify.com and sign in', 'Click your avatar top right, then User settings', 'Open Applications, then Personal access tokens', 'Click "New access token", name it anything, generate it', 'Copy the token, you will not see it again, and paste it below'],
    fields: [
      { key: 'apiToken', label: 'Personal access token', type: 'password', placeholder: 'nfp_...' }
    ] }
];

export function mount(root) {
  const page = h('div', { class: 'page' });
  root.append(page);
  const render = () => page.replaceChildren(...build());
  const off = store.sub(c => { if (c === 'settings' || c === '*') render(); });
  render();
  return off;
}

function current() {
  const s = store.get('settings', 'app') || DEFAULT;
  const engines = { ...Object.fromEntries(PROVIDERS.map(p => [p.id, emptyEngine()])), ...(s.engines || {}) };
  return { ...s, engines };
}
function patch(fn) {
  const s = current();
  fn(s);
  store.put('settings', s);
}

function build() {
  const s = current();
  const head = h('div', { class: 'page-head' },
    h('div', null, h('p', { class: 'eyebrow', text: 'Settings' }), h('h1', { text: 'Model & connections' }),
      h('p', { class: 'muted', text: 'Turn on the engines you want to use, add each one’s API key, then pick which one actually powers replies in the Team tab. Every one below is free, with the exact steps to get a key.' })));
  return [head, enginesPanel(s), integrationsPanel(s), activePanel(s)];
}

/* ---------- integrations (Resend, Twilio: not chat engines, one-off service connections) ---------- */
function integrationsPanel(s) {
  return panel('Integrations', infoIcon('Same storage as your engine keys above, owner-only. These power real sending and real calling elsewhere in the app, not the Team tab.', 'integrations'),
    h('div', { class: 'engines pad' }, INTEGRATIONS.map(meta => integrationCard(meta, s.engines[meta.id] || emptyIntegration(meta)))));
}
function emptyIntegration(meta) { return { enabled: false, ...Object.fromEntries(meta.fields.map(f => [f.key, ''])) }; }

function integrationCard(meta, engine) {
  const { id, label, signupUrl, steps, fields } = meta;
  const wrap = h('div', { class: 'engine-card' });
  const local = { editing: false, reveal: {}, showSteps: false, error: '' };

  function repaint() { wrap.replaceChildren(...body()); }
  function toggleEnabled(checked) { patch(s => { s.engines[id] = { ...(s.engines[id] || emptyIntegration(meta)), enabled: checked }; }); }
  function saveFields(values) {
    const missing = fields.filter(f => !values[f.key] || !values[f.key].trim());
    if (missing.length) { local.error = 'Fill in every field first.'; repaint(); return; }
    patch(s => { s.engines[id] = { ...(s.engines[id] || emptyIntegration(meta)), enabled: true, ...Object.fromEntries(fields.map(f => [f.key, values[f.key].trim()])) }; });
    local.editing = false; local.error = ''; toast(label + ' connected');
  }
  function removeKeys() {
    patch(s => { s.engines[id] = emptyIntegration(meta); });
    toast(label + ' disconnected');
  }

  function body() {
    const connected = fields.every(f => engine[f.key] && String(engine[f.key]).trim());
    const onToggle = h('input', { type: 'checkbox', 'aria-label': 'Turn on ' + label });
    onToggle.checked = !!engine.enabled;
    onToggle.addEventListener('change', () => toggleEnabled(onToggle.checked));

    const top = h('div', { class: 'engine-top' },
      h('div', { class: 'engine-id' },
        h('span', { class: 'engine-badge' }, icon('key', 16)),
        h('div', null,
          h('div', { class: 'actions' }, h('strong', { text: label })),
          h('label', { class: 'actions small muted' }, onToggle, 'Use this'))),
      engine.enabled
        ? h('span', { class: 'engine-status on' }, icon('checkCircle', 14), connected ? 'Connected' : 'On, no key yet')
        : h('span', { class: 'engine-status off' }, 'Off'));

    const stepsToggle = h('button', { class: 'steps-toggle', type: 'button', 'aria-expanded': String(local.showSteps), onclick: () => { local.showSteps = !local.showSteps; repaint(); } },
      icon('chevD', 13), 'How to set this up');
    const stepsList = local.showSteps ? h('ol', { class: 'steps' }, steps.map(t => h('li', { text: t }))) : null;
    const kids = [top, h('div', null, stepsToggle, stepsList)];

    if (connected && !local.editing) {
      kids.push(h('div', { class: 'stack' }, fields.map(f =>
        h('div', { class: 'masked-key' }, h('code', { text: f.type === 'password' ? maskKey(String(engine[f.key])) : engine[f.key] }), h('span', { class: 'muted small', text: f.label })))));
    }

    if (local.editing) {
      const ins = {};
      fields.forEach(f => { ins[f.key] = input({ type: local.reveal[f.key] ? 'text' : f.type, placeholder: f.placeholder || f.label, autocomplete: 'off', value: engine[f.key] || '' }); });
      const err = local.error ? h('p', { class: 'form-error', text: local.error }) : null;
      kids.push(h('form', { class: 'stack', onsubmit: e => { e.preventDefault(); saveFields(Object.fromEntries(fields.map(f => [f.key, ins[f.key].value]))); } },
        fields.map(f => field(f.label, ins[f.key])), err,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small primary', type: 'submit', text: 'Save' }),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { local.editing = false; local.error = ''; repaint(); }, text: 'Cancel' }))));
    } else {
      kids.push(h('div', { class: 'actions wrap' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { local.editing = true; repaint(); } }, connected ? 'Replace' : 'Add details'),
        connected ? h('button', { class: 'btn small ghost', type: 'button', onclick: removeKeys }, icon('x', 13), 'Remove') : null,
        signupUrl ? h('a', { class: 'text-link', href: signupUrl, target: '_blank', rel: 'noopener', text: 'Open dashboard', style: 'margin-left:auto' }) : null));
    }
    return kids;
  }
  repaint();
  return wrap;
}

/* ---------- your engines ---------- */
function enginesPanel(s) {
  return panel('Your engines', infoIcon('Keys are saved to your account, the same place client notes and leads live, only you and Max can read them signed in. They are used only to call that provider when you chat with an agent.', 'engines'),
    h('div', { class: 'engines pad' }, PROVIDERS.map(meta => engineCard(meta, s.engines[meta.id]))),
    h('div', { class: 'callout' },
      h('a', { class: 'text-link', href: 'https://github.com/Krushnaapatil/free-llm-api-resources', target: '_blank', rel: 'noopener', text: 'Browse more free LLM APIs and their real rate limits' }),
      h('p', { class: 'muted small', text: 'Want a newer GLM build instead of Kimi? Same Cloudflare Workers AI account works: turn on Custom, set the base URL to https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1, the key to a Cloudflare API token, and the model to something like @cf/zai-org/glm-4.7-flash. Checked 2026-09-22: no free tier anywhere currently has Kimi K3 or GLM-5.2, those may not exist yet.' }),
      h('p', { class: 'muted small', text: 'Using a local model with Ollama? It has no public address, this app cannot reach it directly. Point Custom at a tunnel (like ngrok) instead, and keep that tunnel running.' })));
}

/* Self-contained card: local UI state (editing/reveal/showSteps) repaints only this card.
   Only an actual save/remove/toggle touches the store, which repaints the whole page,
   same as every other form in this app. */
function engineCard(meta, engine) {
  const { id, label, signupUrl, steps, models, accountIdMode } = meta;
  const wrap = h('div', { class: 'engine-card' });
  const local = { editing: false, reveal: false, showSteps: false, error: '' };

  function repaint() { wrap.replaceChildren(...body()); }

  function toggleEnabled(checked) {
    patch(s => { s.engines[id] = { ...s.engines[id], enabled: checked }; });
  }
  function saveKey(value) {
    if (!value.trim()) { local.error = 'Paste a key first.'; repaint(); return; }
    patch(s => { s.engines[id] = { ...s.engines[id], enabled: true, apiKey: value.trim() }; });
    local.editing = false; local.error = ''; toast(label + ' connected');
  }
  function saveCustomFields(baseUrl, customLabel) {
    patch(s => { s.engines[id] = { ...s.engines[id], baseUrl: baseUrl.trim(), label: customLabel.trim() }; });
  }
  function saveAccountId(accountId) {
    patch(s => { s.engines[id] = { ...s.engines[id], accountId: accountId.trim(), baseUrl: accountId.trim() ? cfBaseUrl(accountId) : '' }; });
  }
  function removeKey() {
    patch(s => { s.engines[id] = { ...s.engines[id], enabled: false, apiKey: '' }; });
    toast(label + ' disconnected');
  }

  function body() {
    const connected = !!(engine.apiKey && engine.apiKey.trim());
    const onToggle = h('input', { type: 'checkbox', 'aria-label': 'Turn on ' + label });
    onToggle.checked = !!engine.enabled;
    onToggle.addEventListener('change', () => toggleEnabled(onToggle.checked));

    const top = h('div', { class: 'engine-top' },
      h('div', { class: 'engine-id' },
        h('span', { class: 'engine-badge' }, icon('key', 16)),
        h('div', null,
          h('div', { class: 'actions' }, h('strong', { text: label }), pill('Free', 'good')),
          h('label', { class: 'actions small muted' }, onToggle, 'Use this engine'))),
      engine.enabled
        ? h('span', { class: 'engine-status on' }, icon('checkCircle', 14), connected ? 'Connected' : 'On, no key yet')
        : h('span', { class: 'engine-status off' }, 'Off'));

    const stepsToggle = h('button', { class: 'steps-toggle', type: 'button', 'aria-expanded': String(local.showSteps), onclick: () => { local.showSteps = !local.showSteps; repaint(); } },
      icon('chevD', 13), 'How to get this key');
    const stepsList = local.showSteps ? h('ol', { class: 'steps' }, steps.map(t => h('li', { text: t }))) : null;

    const kids = [top, h('div', null, stepsToggle, stepsList)];

    if (connected && !local.editing) {
      kids.push(h('div', { class: 'masked-key' }, h('code', { text: maskKey(engine.apiKey.trim()) }), h('span', { class: 'muted small', text: engine.enabled ? 'Saved here' : 'Saved, but turned off' })));
      if (engine.enabled) {
        const modelListId = 'models-' + id;
        const testModel = input({ class: 'small', placeholder: models[0] || 'model to test with', list: modelListId }); testModel.value = models[0] || '';
        const modelList = h('datalist', { id: modelListId }, models.map(m => h('option', { value: m })));
        const testStatus = h('span', { class: 'muted small block' });
        const testBtn = h('button', { class: 'btn small', type: 'button', onclick: () => runTest(id, testModel.value.trim(), testStatus, testBtn) }, 'Test connection');
        kids.push(h('div', { class: 'actions wrap' }, testModel, modelList, testBtn), testStatus);
      }
    }
    if (accountIdMode && (engine.enabled || connected)) {
      const acctIn = input({ placeholder: 'Cloudflare Account ID', value: engine.accountId || '' });
      acctIn.addEventListener('change', () => saveAccountId(acctIn.value));
      kids.push(field('Account ID', acctIn, engine.baseUrl ? 'Calling ' + engine.baseUrl : 'Base URL is built for you from this.'));
    } else if (id === 'custom' && (engine.enabled || connected)) {
      const baseIn = input({ placeholder: 'https://your-endpoint/v1', value: engine.baseUrl || '' });
      const labelIn = input({ placeholder: 'What is this? (your own note)', value: engine.label || '' });
      baseIn.addEventListener('change', () => saveCustomFields(baseIn.value, labelIn.value));
      labelIn.addEventListener('change', () => saveCustomFields(baseIn.value, labelIn.value));
      kids.push(field('Base URL', baseIn), field('Label', labelIn));
    }

    if (local.editing) {
      const keyIn = input({ type: local.reveal ? 'text' : 'password', placeholder: 'Paste your ' + label + ' API key', autocomplete: 'off' });
      const reveal = h('button', { class: 'icon-btn small', type: 'button', 'aria-label': local.reveal ? 'Hide key' : 'Show key', onclick: () => { local.reveal = !local.reveal; repaint(); keyIn.focus(); } }, icon('eye', 15));
      const err = local.error ? h('p', { class: 'form-error', text: local.error }) : null;
      kids.push(h('form', { class: 'stack', onsubmit: e => { e.preventDefault(); saveKey(keyIn.value); } },
        h('div', { class: 'actions' }, keyIn, reveal), err,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small primary', type: 'submit', text: 'Save key' }),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { local.editing = false; local.error = ''; repaint(); }, text: 'Cancel' }))));
    } else {
      kids.push(h('div', { class: 'actions wrap' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { local.editing = true; repaint(); } }, connected ? 'Replace key' : 'Add key'),
        connected ? h('button', { class: 'btn small ghost', type: 'button', onclick: removeKey }, icon('x', 13), 'Remove') : null,
        signupUrl ? h('a', { class: 'text-link', href: signupUrl, target: '_blank', rel: 'noopener', text: 'Open signup page', style: 'margin-left:auto' }) : null));
    }
    return kids;
  }

  repaint();
  return wrap;
}

async function runTest(providerId, model, statusEl, btn) {
  if (MODE !== 'remote') { statusEl.textContent = 'Test only works on the live site, not local preview.'; return; }
  if (!model) { statusEl.textContent = 'Enter a model name first.'; return; }
  btn.disabled = true; statusEl.textContent = 'Testing...';
  try {
    const payload = wireRequest(providerId, model, current().engines, {
      agent: { title: 'Connection test', dept: '', blurb: '', skills: [] }, history: [], message: 'Reply with the single word OK.'
    });
    const res = await remote.fn('agent-chat', payload);
    statusEl.textContent = res.ok ? 'Connected. It replied: "' + res.reply.slice(0, 80) + '"' : 'Something went wrong.';
  } catch (e) { statusEl.textContent = 'Failed: ' + e.message; }
  btn.disabled = false;
}

/* ---------- active model ---------- */
function activePanel(s) {
  const onMetas = PROVIDERS.filter(p => s.engines[p.id].enabled);
  if (!onMetas.length) return panel('Active model', null, empty('Turn on at least one engine above first.'));

  const provSel = select(onMetas.map(p => [p.id, p.label]), onMetas.some(p => p.id === s.provider) ? s.provider : onMetas[0].id, { 'aria-label': 'Engine' });
  const modelIn = input({ placeholder: 'Model name', list: 'model-suggestions', value: s.model || '' });
  const suggestions = h('datalist', { id: 'model-suggestions' });
  const fillSuggestions = () => {
    const p = PROVIDERS.find(x => x.id === provSel.value);
    suggestions.replaceChildren(...((p && p.models) || []).map(m => h('option', { value: m })));
  };
  fillSuggestions();
  const save = () => patch(s2 => { s2.provider = provSel.value; s2.model = modelIn.value.trim(); });
  provSel.addEventListener('change', () => { fillSuggestions(); save(); });
  modelIn.addEventListener('change', save);

  return panel('Active model', infoIcon('This is what replies in the Team tab actually use. Changing it takes effect on your very next message, nothing to restart.', 'the active model'),
    h('div', { class: 'pad stack' }, field('Engine', provSel), suggestions, field('Model', modelIn, 'Pick a suggestion or type any model name this engine supports.')));
}
