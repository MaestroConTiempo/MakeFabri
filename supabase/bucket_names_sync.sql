-- Global bucket names synced across devices.
-- Run this on existing projects to enable cloud sync for Fogon names.

create table if not exists public.mt_bucket_names (
  id text primary key check (id = 'global'),
  stove_main_name text not null default '',
  stove_secondary_name text not null default '',
  sink_name text not null default '',
  updated_at timestamptz not null default timezone('utc'::text, now())
);

drop trigger if exists trg_mt_bucket_names_updated_at on public.mt_bucket_names;
create trigger trg_mt_bucket_names_updated_at
before update on public.mt_bucket_names
for each row execute function public.mt_set_updated_at();

alter table public.mt_bucket_names enable row level security;

drop policy if exists "mt_bucket_names_shared_all" on public.mt_bucket_names;
create policy "mt_bucket_names_shared_all"
on public.mt_bucket_names
for all
to authenticated
using (true)
with check (true);
