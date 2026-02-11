-- Shared highlights mode (single global highlight history for all devices/users)
-- Run this after the base schema if you want all visitors to share mt_highlights.

alter table public.mt_highlights enable row level security;

drop policy if exists "mt_highlights_owner_all" on public.mt_highlights;
drop policy if exists "mt_highlights_shared_all" on public.mt_highlights;

create policy "mt_highlights_shared_all"
on public.mt_highlights
for all
to authenticated
using (true)
with check (true);
