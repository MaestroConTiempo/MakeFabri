-- Shared tasks mode (single global task list for all devices/users)
-- Run this after the base schema if you want all visitors to share mt_tasks.

alter table public.mt_tasks enable row level security;

drop policy if exists "mt_tasks_owner_all" on public.mt_tasks;
drop policy if exists "mt_tasks_shared_all" on public.mt_tasks;

create policy "mt_tasks_shared_all"
on public.mt_tasks
for all
to authenticated
using (true)
with check (true);
