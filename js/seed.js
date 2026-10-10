/* Sample data only. The real project loads its data from the database behind a login.
   This file keeps the Team tab populated so the app runs in local preview (add ?local to the URL). */
export const SEED_VERSION = 1;

export const AGENTS = [
  { id: 'kendall', title: 'Account Lead', name: 'Account Lead', dept: 'Leadership', human: true, reportsTo: null,
    blurb: 'Approves anything client facing, sends email, sets pricing and signs off on spend.', skills: ['Approvals', 'Pricing', 'Client calls'] },

  { id: 'max', title: 'SEO Strategist', name: 'SEO Strategist', dept: 'Leadership', human: true, reportsTo: null,
    blurb: 'Leads SEO strategy and is the other person agents escalate to on pricing, scope changes and anything client facing.', skills: ['SEO strategy', 'Approvals'] },

  { id: 'coo', title: 'Chief Operating Officer', dept: 'Executive', reportsTo: 'kendall', agentKey: 'coo-router', home: 'project', model: 'Opus',
    blurb: 'Breaks any multi-step job into division tasks, sequences them, checks the work against the brief and reports back. Does no specialist work.',
    skills: ['Routing', 'Quality check', 'Status reports'] },

  { id: 'hcs', title: 'Head of Client Services', dept: 'Client Services', reportsTo: 'coo', agentKey: 'client-services', home: 'project', model: 'Sonnet',
    blurb: 'Client emails, onboarding, status updates, renewals, upsells and scope control.', skills: ['Client emails', 'Onboarding', 'Scope control'] },
  { id: 'hos', title: 'Head of Strategy', dept: 'Strategy', reportsTo: 'coo', agentKey: 'strategy', home: 'project', model: 'Sonnet',
    blurb: 'Site audits, competitor scans, positioning, roadmaps and KPI plans.', skills: ['Audits', 'Competitor scans', '30-60-90 roadmaps'] },

  { id: 'cd', title: 'Creative Director', dept: 'Creative', reportsTo: 'coo', agentKey: 'creative', home: 'project', model: 'Sonnet',
    blurb: 'Brand direction, copy and visual concepts. Always three directions: safe, bold and local heritage.', skills: ['Brand', 'Copy', 'Concepts'] },
  { id: 'mcd', title: 'Marketing Content Director', dept: 'Creative', reportsTo: 'cd', agentKey: 'Marketing Content Director', home: 'global',
    blurb: 'Turns a creative ask into finished graphics, video, copy and brand content, for Towpath or any client.', skills: ['Graphics', 'Video', 'Copy'] },
  { id: 'gd', title: 'Marketing Graphic Designer', dept: 'Creative', reportsTo: 'mcd', agentKey: 'Marketing Graphic Designer', home: 'global',
    blurb: 'Finished social posts, ads and flyers in Canva and Figma from the client\'s real brand kit.', skills: ['Canva', 'Figma', 'Social graphics'] },
  { id: 'vp', title: 'Product Marketing Video Producer', dept: 'Creative', reportsTo: 'mcd', agentKey: 'Product Marketing Video Producer', home: 'global',
    blurb: 'Finished UGC style ads, product showcases and short form video.', skills: ['Short video', 'UGC ads'] },
  { id: 'cw', title: 'Product Marketing Content Writer', dept: 'Creative', reportsTo: 'mcd', agentKey: 'Product Marketing Content Writer', home: 'global',
    blurb: 'Product descriptions, ad copy, landing page copy and email copy in the house voice.', skills: ['Ad copy', 'Landing pages', 'Email copy'] },
  { id: 'bs', title: 'Business and Brand Content Strategist', dept: 'Creative', reportsTo: 'mcd', agentKey: 'Business & Brand Content Strategist', home: 'global',
    blurb: 'Brand positioning, about pages, case studies and consistency checks across the team\'s output.', skills: ['Positioning', 'Case studies', 'Brand checks'] },

  { id: 'hpm', title: 'Head of Paid Media', dept: 'Paid Media', reportsTo: 'coo', agentKey: 'paid-media', home: 'project', model: 'Sonnet',
    blurb: 'Google and Meta ad plans, keywords, budgets and ad copy. Plans only, never live spend.', skills: ['Google Ads', 'Meta Ads', 'Budgets'] },
  { id: 'sco', title: 'SEO and Content Director', dept: 'SEO and Content', reportsTo: 'coo', agentKey: 'seo-content', home: 'project', model: 'Sonnet',
    blurb: 'Local SEO, Google Business Profile, keyword maps by town and content briefs.', skills: ['Local SEO', 'GBP', 'Keyword maps'] },
  { id: 'wdd', title: 'Web and Development Director', dept: 'Web and Development', reportsTo: 'coo', agentKey: 'web-dev', home: 'project', model: 'Sonnet',
    blurb: 'Wireframes, page structure, static site builds and QA. Does not deploy.', skills: ['Static sites', 'QA', 'Wireframes'] },
  { id: 'hdm', title: 'Head of Data and MarTech', dept: 'Data and MarTech', reportsTo: 'coo', agentKey: 'data-martech', home: 'project', model: 'Sonnet',
    blurb: 'Tracking specs, GA4 and GTM plans, CRM stages and follow-up automations.', skills: ['GA4', 'GTM', 'CRM stages'] },
  { id: 'sl', title: 'Social and Community Lead', dept: 'Social', reportsTo: 'coo', agentKey: 'social', home: 'project', model: 'Haiku',
    blurb: 'Content calendars, captions, reply templates and local partnership ideas.', skills: ['Calendars', 'Captions', 'Partnerships'] },

  { id: 'hbd', title: 'Head of Business Development', dept: 'Business Development', reportsTo: 'coo', agentKey: 'biz-dev', home: 'project', model: 'Sonnet',
    blurb: 'Lead scoring, cold emails, call scripts and proposals.', skills: ['Lead scoring', 'Cold email', 'Proposals'] },
  { id: 'lgpm', title: 'Lead Gen Project Manager', dept: 'Business Development', reportsTo: 'hbd', agentKey: 'Lead Gen Project Manager', home: 'global',
    blurb: 'Runs a full prospecting pass for a town or category and lands verified, drafted leads in the Lead Queue.', skills: ['Prospecting runs', 'Coordination'] },
  { id: 'llr', title: 'Local Lead Researcher', dept: 'Business Development', reportsTo: 'lgpm', agentKey: 'Local Lead Researcher', home: 'global',
    blurb: 'Finds candidate local businesses in a town with a Google Maps scraper. Candidates only, no verification.', skills: ['Maps scraper', 'Town sweeps'] },
  { id: 'lv', title: 'Lead Verifier', dept: 'Business Development', reportsTo: 'lgpm', agentKey: 'Lead Verifier', home: 'global',
    blurb: 'Confirms no site, a broken site or no online ordering, and finds a real contact email. Never guesses.', skills: ['Verification', 'Contact emails'] },
  { id: 'oc', title: 'Outreach Copywriter', dept: 'Business Development', reportsTo: 'lgpm', agentKey: 'Outreach Copywriter', home: 'global',
    blurb: 'Writes one cold email per verified lead in the Towpath voice, revenue cost first, one clear ask.', skills: ['Cold email', 'Subject lines'] },
  { id: 'lqm', title: 'Lead Queue Data Manager', dept: 'Business Development', reportsTo: 'lgpm', agentKey: 'Lead Queue Data Manager', home: 'global',
    blurb: 'Dedupes, writes and moves leads in the Lead Queue. Writes only what it is given.', skills: ['Dedupe', 'Pipeline moves'] },

  { id: 'hop', title: 'Head of Operations', dept: 'Operations', reportsTo: 'coo', agentKey: 'operations', home: 'project', model: 'Haiku',
    blurb: 'Project timelines, task tracking, invoice drafts and process cleanup.', skills: ['Timelines', 'Invoice drafts'] }
];

/* ---------- agent tasks (start in backlog, nothing runs until you queue it) ---------- */
export const AGENT_TASKS = [];
export const ACTIVITY = [];
export const CLIENTS = [];
