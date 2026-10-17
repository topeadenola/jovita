-- Jovita v2: per-invoice reminders, Train your Jovita, onboarding, appearance
alter table public.invoices add column if not exists reminders_on boolean not null default true;
alter table public.studios
  add column if not exists tone_warmth smallint not null default 2 check (tone_warmth between 0 and 2),
  add column if not exists tone_length smallint not null default 1 check (tone_length between 0 and 2),
  add column if not exists careers text[] not null default '{}',
  add column if not exists onboarded boolean not null default false,
  add column if not exists theme text not null default 'auto' check (theme in ('light','dark','auto'));
-- studios that already exist skip the new onboarding
update public.studios set onboarded = true;
