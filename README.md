# Towpath CRM

A small CRM for a small agency where AI agents appear on the team. Built with plain JavaScript modules, no build step, and Supabase for data and login. Part of Kendall Clark's portfolio.

Case study: https://kendallclark.design/case-study-towpath-crm

## What it does

| Area | What it does |
| --- | --- |
| Dashboard | Pipeline funnel, follow-ups due, client watch, team queue, activity |
| Leads | List and pipeline board, a detail drawer, follow-up cadence |
| Clients | Profiles with items, a time clock, branded report generator, tool links |
| Calendar | Month and agenda views and a self-built meeting scheduler |
| Email | Compose, templates, a sent log (copy, send elsewhere, log as sent) |
| Team | Agents listed as employees, each with a chat and a task queue |

## Design decisions

- **Nothing runs unasked.** Agent tasks start in backlog. Only tasks moved to queued are meant to be picked up by an agent session.
- **Honest analytics.** Only numbers the app can verify are shown. Everything else says "not connected".
- **Client data stays out of the deploy.** `deploy.sh` leaves out seed files, and the live app reads everything from the database behind a login.
- **One storage file.** `js/store.js` is the only file that changes when moving between local preview and Supabase.

## Run it locally

```
python3 -m http.server 8137
```

Open http://127.0.0.1:8137/?local. Local mode never touches a database. Any password works.

## Use your own Supabase project

1. Create a Supabase project and run `supabase/schema.sql`.
2. Put your project URL and publishable key in `js/config.js`.
3. Add your email to the `owners` table. Row-level security only lets owners read and write.
4. Turn off new sign-ups in Supabase Authentication.

`js/seed.js` and `js/seed-leads.js` here hold sample data only.

## Deploy

`./deploy.sh` builds a clean `_site/` folder for Netlify.

## Status

A private tool in active development, shared here as a code sample. No client data is included.
