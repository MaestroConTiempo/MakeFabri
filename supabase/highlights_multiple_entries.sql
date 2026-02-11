-- Allow multiple highlight rows per user and date.
-- Required so creating a new highlight from tasks does not overwrite the previous one.

alter table public.mt_highlights
  drop constraint if exists mt_highlights_user_id_date_key;
