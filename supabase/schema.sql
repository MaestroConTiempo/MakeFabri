-- MakeFabri - Schema for tasks, highlights and settings.
-- Prepared for future full auth. It already works with Supabase anonymous auth.

create extension if not exists pgcrypto;

create or replace function public.mt_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.mt_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text null,
  bucket text not null check (bucket in ('stove_main', 'stove_secondary', 'sink')),
  order_index integer not null default 0,
  status text not null check (status in ('todo', 'doing', 'done', 'archived')),
  est_minutes integer null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.mt_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  task_id uuid null references public.mt_tasks(id) on delete set null,
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null,
  remind_before_minutes integer not null default 30,
  google_calendar_event_id text null,
  google_calendar_event_link text null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, date)
);

create table if not exists public.mt_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Madrid',
  default_duration_minutes integer not null default 60,
  default_remind_before_minutes integer not null default 30,
  default_plan_hour text not null default '20:30',
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_mt_tasks_user_id on public.mt_tasks(user_id);
create index if not exists idx_mt_tasks_user_bucket on public.mt_tasks(user_id, bucket);
create index if not exists idx_mt_highlights_user_id on public.mt_highlights(user_id);
create index if not exists idx_mt_highlights_user_date on public.mt_highlights(user_id, date desc);

drop trigger if exists trg_mt_tasks_updated_at on public.mt_tasks;
create trigger trg_mt_tasks_updated_at
before update on public.mt_tasks
for each row execute function public.mt_set_updated_at();

drop trigger if exists trg_mt_highlights_updated_at on public.mt_highlights;
create trigger trg_mt_highlights_updated_at
before update on public.mt_highlights
for each row execute function public.mt_set_updated_at();

drop trigger if exists trg_mt_settings_updated_at on public.mt_settings;
create trigger trg_mt_settings_updated_at
before update on public.mt_settings
for each row execute function public.mt_set_updated_at();

alter table public.mt_tasks enable row level security;
alter table public.mt_highlights enable row level security;
alter table public.mt_settings enable row level security;

drop policy if exists "mt_tasks_owner_all" on public.mt_tasks;
create policy "mt_tasks_owner_all"
on public.mt_tasks
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "mt_highlights_owner_all" on public.mt_highlights;
create policy "mt_highlights_owner_all"
on public.mt_highlights
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "mt_settings_owner_all" on public.mt_settings;
create policy "mt_settings_owner_all"
on public.mt_settings
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
