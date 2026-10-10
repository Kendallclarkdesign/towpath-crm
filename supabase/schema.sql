-- Towpath CRM schema. Applied to the live Supabase project `towpath-crm` (id YOUR-PROJECT-REF).
-- One table per collection the app already uses. Each row is { id, data }, so the
-- browser code (js/store.js) needs no field-by-field mapping. Promote hot fields
-- (lead stage, task status) to real columns later if you need faster queries.

create table if not exists public.owners (
  email text primary key
);
insert into public.owners (email) values ('you@example.com')
  on conflict do nothing;
-- No policies on purpose: nobody can read the list through the API. Only is_owner() reads it.
alter table public.owners enable row level security;

-- true only for a signed-in user whose email is on the owners list
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where email = (auth.jwt() ->> 'email'));
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['leads','clients','agents','agent_tasks','messages','emails','events','activity','time_entries','settings','seo_vault','content_posts','site_previews','gsc_snapshots']
  loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- The team queue: what a Claude Code session should pick up.
-- security_invoker makes the view obey the table's row level security instead of bypassing it.
create or replace view public.queued_agent_tasks with (security_invoker = true) as
  select id, data from public.agent_tasks where data ->> 'status' = 'queued';
revoke all on public.queued_agent_tasks from anon;

-- Private storage bucket for the Phone tab's uploaded call recordings, same owner-only
-- access as every table above.
insert into storage.buckets (id, name, public)
  values ('call-recordings', 'call-recordings', false)
  on conflict (id) do nothing;
drop policy if exists owner_all_call_recordings on storage.objects;
create policy owner_all_call_recordings on storage.objects
  for all to authenticated
  using (bucket_id = 'call-recordings' and public.is_owner())
  with check (bucket_id = 'call-recordings' and public.is_owner());

-- Sign ups stay OFF in the Supabase dashboard (Authentication > Providers > Email > disable sign ups),
-- so only the account you create by hand can ever log in.
