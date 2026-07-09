-- One-time migration: the mt_bucket_configs table already exists with the
-- old per-device schema (primary key user_id, one row per anonymous device
-- session). This merges all existing rows into a single shared global row
-- and rebuilds the table with the correct schema.
--
-- Use this instead of bucket_configs_sync.sql when mt_bucket_configs
-- already exists with a `user_id` column instead of `id`.

do $$
declare
  merged jsonb;
begin
  -- Merge existing per-device rows into one list, deduping by bucket id
  -- and keeping the first occurrence encountered.
  with items as (
    select
      elem ->> 'id' as bucket_id,
      elem as config,
      row_number() over () as seq
    from public.mt_bucket_configs t, jsonb_array_elements(t.configs) as elem
  ),
  dedup as (
    select distinct on (bucket_id) bucket_id, config, seq
    from items
    order by bucket_id, seq
  )
  select coalesce(jsonb_agg(config order by seq), '[]'::jsonb)
  into merged
  from dedup;

  drop table if exists public.mt_bucket_configs;

  create table public.mt_bucket_configs (
    id text primary key check (id = 'global'),
    configs jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default timezone('utc'::text, now())
  );

  insert into public.mt_bucket_configs (id, configs) values ('global', merged);
end $$;

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

-- After running this, check the Table Editor: mt_bucket_configs should have
-- exactly one row with id = 'global' containing every custom fogon from
-- every device. The order inside `configs` may not match either device's
-- original order — reorder manually in /fogons if needed.
