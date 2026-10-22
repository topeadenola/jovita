-- Jovita update 24: each subscription can remember its website, so the app shows its logo (Claude, Adobe, Evoto…).
-- Paste into Supabase › SQL Editor › New query and press Run (make sure the project at the top says jovita). Safe to run more than once.
alter table public.subscriptions add column if not exists website text;
