/* Shared constants and small pieces of business logic. */

export const STAGES = [
  { id: 'research', label: 'Research', tone: 'neutral' },
  { id: 'verified', label: 'Verified', tone: '' },
  { id: 'drafted', label: 'Drafted', tone: '' },
  { id: 'outreach', label: 'Outreach', tone: 'gold' },
  { id: 'interested', label: 'Interested', tone: 'good' },
  { id: 'won', label: 'Won', tone: 'good' },
  { id: 'declined', label: 'Declined', tone: 'danger' }
];
export const stageOf = id => STAGES.find(s => s.id === id) || STAGES[0];

/* Tool links for a client's Overview tab. `custom` is a per-client array of { label, url }
   for anything specific (a known GA4 property, a Search Console resource, a Figma file).
   Domain-derived links only need a real website and work for any client, no extra setup. */
export function toolLinks(client) {
  const custom = client.tools || [];
  const domain = client.website ? client.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  const generic = domain ? [
    { label: 'Ahrefs: Site Explorer', url: 'https://ahrefs.com/site-explorer/overview/v2/subdomains/live?target=' + encodeURIComponent(domain) },
    { label: 'Search Console', url: 'https://search.google.com/search-console?resource_id=' + encodeURIComponent(client.website) },
    { label: 'PageSpeed Insights', url: 'https://pagespeed.web.dev/analysis?url=' + encodeURIComponent(client.website) }
  ] : [];
  return [...custom, ...generic];
}

export const WEB = {
  none: 'No website',
  broken: 'Site is down',
  no_ordering: 'No online ordering',
  outdated: 'Outdated site',
  new_no_seo: 'New, no SEO'
};

/* Outreach rule from sops/biz-dev/outreach-rules.md: follow up on day 3, 7 and 14, then stop. */
export const CADENCE = [3, 7, 14];
export function nextFollowUp(lead) {
  if (lead.stage !== 'outreach' || !lead.contactedAt) return null;
  const n = lead.followups || 0;
  if (n >= CADENCE.length) return null;
  const d = new Date(lead.contactedAt);
  d.setDate(d.getDate() + CADENCE[n]);
  return d;
}

/* SEO Vault: tips pulled from Instagram videos by tools/seo_vault_pipeline.py. */
export const SEO_CATEGORIES = ['Local SEO', 'Google Business Profile', 'On-page', 'Technical', 'Content', 'AI Search', 'Links', 'Social'];
export const SEO_ACCURACY_TONE = { 'Current & supported': 'good', 'Outdated': 'gold', 'Myth': 'danger', 'Unverified': 'neutral' };
export const SEO_ROUTING = [
  { id: 'Client deliverable', tone: 'good' },
  { id: 'Internal workflow', tone: '' },
  { id: 'Sales pitch talking point', tone: 'gold' },
  { id: 'Skip', tone: 'neutral' }
];

/* Content calendar: blog/social posts across all clients, tracked from idea through live. */
export const CONTENT_STATUS = [
  { id: 'drafted', label: 'Drafted', tone: 'neutral' },
  { id: 'scheduled', label: 'Scheduled', tone: 'gold' },
  { id: 'published', label: 'Published', tone: 'good' }
];
export const contentStatusOf = id => CONTENT_STATUS.find(s => s.id === id) || CONTENT_STATUS[0];

/* Phone page: calling through the lead queue. */
export const CALL_OUTCOMES = [
  { id: 'no_answer', label: 'No answer' },
  { id: 'voicemail', label: 'Left voicemail' },
  { id: 'talked', label: 'Talked to them' },
  { id: 'interested', label: 'Interested' },
  { id: 'not_interested', label: 'Not interested' },
  { id: 'do_not_call', label: 'Asked not to be called again' }
];

/* Static rule of thumb, not a real scheduling system. Food-service categories avoid meal
   rushes; everything else just avoids obviously-closed hours. Uses the caller's local clock. */
export function bestTimeHint(lead) {
  const cat = (lead.category || '').toLowerCase();
  const hour = new Date().getHours();
  const isFood = /restaurant|cafe|café|diner|pizzer|bakery|pub|bar|deli|market|grill/.test(cat);
  if (isFood) {
    if (hour >= 11 && hour < 14) return 'Lunch rush for this category, probably a bad time to call.';
    if (hour >= 17 && hour < 20) return 'Dinner rush for this category, probably a bad time to call.';
    return 'Outside meal rush, a reasonable time to call.';
  }
  if (hour < 9) return 'Early, they may not be open yet.';
  if (hour >= 18) return 'After typical close for a lot of local shops.';
  return 'Normal business hours, a reasonable time to call.';
}

export const TASK_STATUS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'queued', label: 'Queued' },
  { id: 'running', label: 'Running' },
  { id: 'review', label: 'Needs review' },
  { id: 'done', label: 'Done' }
];

export const FROM = 'you@yourdomain.com';
export const SIGNATURE = 'Your Name, Your Company, (555) 010-0000';

/* Template engine: {var} substitution plus a single level of {if var}...{else}...{endif}.
   Deliberately small and dependency-free rather than pulling in a templating library,
   this covers what the templates below actually need. `if` checks truthiness in ctx. */
export function renderTemplate(str, ctx) {
  let out = String(str).replace(/\{if\s+(\w+)\}([\s\S]*?)(?:\{else\}([\s\S]*?))?\{endif\}/g,
    (_, key, truthy, falsy = '') => (ctx[key] ? truthy : falsy));
  out = out.replace(/\{(\w+)\}/g, (m, key) => (key in ctx ? String(ctx[key]) : m));
  return out;
}

/* Builds the variables a template can use for a given lead or client.
   Leads have no separate contact-name field, only a business name, so `name`/`first`
   stays "there" for leads, same as the compose form already assumed before this existed. */
export function templateContext(lead, client) {
  if (lead) return { business: lead.name, name: 'there', first: 'there', town: lead.town || '', category: lead.category || '', followups: lead.followups || 0 };
  if (client) { const known = v => v && v !== 'UNKNOWN'; const first = known(client.owner) ? client.owner.split(' ')[0] : 'there';
    return { business: client.name, name: first, first, town: client.location || '', category: client.industry || '' }; }
  return { business: '[BUSINESS]', name: 'there', first: 'there', town: '', category: '' };
}

/* Email templates. {var} is filled from templateContext(); {if var}...{else}...{endif} is optional. */
export const TEMPLATES = [
  {
    id: 'day3', label: 'Follow up, day 3',
    subject: 'Following up on {business}',
    body: 'Hi {name},\n\nFollowing up on my note about {business}. The gap I mentioned is still sending searches to competitors that have a site{if town} in {town}{endif}. Ten minutes on the phone is enough to show you the fix.\n\n' + SIGNATURE
  },
  {
    id: 'day7', label: 'Follow up, day 7',
    subject: 'The first thing I would fix at {business}',
    body: 'Hi {name},\n\nHere is the first change I would make for {business}: [ONE SPECIFIC FIX]. It usually takes a few days and it is the fastest way to stop losing customers who searched and went elsewhere.\n\nWant me to send a short free audit?\n\n' + SIGNATURE
  },
  {
    id: 'day14', label: 'Last note, day 14',
    subject: 'Last note from Towpath Creative',
    body: 'Hi {name},\n\nThis is my last note. If the timing is off, no problem. If you want the short audit for {business}, reply yes and I will send it over.\n\n' + SIGNATURE
  },
  {
    id: 'proposal', label: 'Proposal cover note',
    subject: 'Proposal for {business}',
    body: 'Hi {name},\n\nAttached is the proposal for {business}. It covers what we found, what we would build, the timeline and the price.\n\nI am glad to walk through it on a call. Reply with a time that works.\n\n' + SIGNATURE
  },
  {
    id: 'update', label: 'Client update',
    subject: '{business} update',
    body: 'Hi {name},\n\nHere is where things stand for {business}.\n\nDone since last time:\n- [WHAT SHIPPED]\n\nNext up:\n- [WHAT IS NEXT]\n\nNeeds you:\n- [ANYTHING WE ARE WAITING ON]\n\n' + SIGNATURE
  }
];
