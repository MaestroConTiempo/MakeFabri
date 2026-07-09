-- Global bucket configs (fogones) synced across devices.
-- Run this on existing projects to enable cloud sync for custom fogones.

create table if not exists public.mt_bucket_configs (
  id text primary key check (id = 'global'),
  configs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

drop trigger if exists trg_mt_bucket_configs_updated_at on public.mt_bucket_configs;
create trigger trg_mt_bucket_configs_updated_at
before update on public.mt_bucket_configs
for each row execute function public.mt_set_updated_at();

alter table public.mt_bucket_configs enable row level security;

drop policy if exists "mt_bucket_configs_shared_all" on public.mt_bucket_configs;
create policy "mt_bucket_configs_shared_all"
on public.mt_bucket_configs
for all
to authenticated
using (true)
with check (true);
