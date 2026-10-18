-- Jovita update 12: track paid months and time left, renewal reminder emails, and plans that end on their date.

-- Every paid or gifted stretch of time, so HQ can show months paid and what's left
create table if not exists public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  plan text not null check (plan in ('pro', 'studio')),
  months integer not null default 1 check (months between 0 and 120),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  source text not null default 'payment' check (source in ('payment', 'gift', 'manual')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists subscription_periods_studio_idx on public.subscription_periods (studio_id, ends_at desc);
alter table public.subscription_periods enable row level security;
drop policy if exists "admins" on public.subscription_periods;
create policy "admins" on public.subscription_periods for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "own studio reads" on public.subscription_periods;
create policy "own studio reads" on public.subscription_periods for select to authenticated using (studio_id = (select public.my_studio_id()));

-- Reminders already sent (one per stage per end date)
create table if not exists public.plan_reminders (
  studio_id uuid not null references public.studios(id) on delete cascade,
  until timestamptz not null,
  stage integer not null,
  sent_at timestamptz not null default now(),
  primary key (studio_id, until, stage)
);
alter table public.plan_reminders enable row level security;
drop policy if exists "admins" on public.plan_reminders;
create policy "admins" on public.plan_reminders for select to authenticated using (public.is_admin());

-- HQ: record a paid stretch (e.g. 3 months of Pro). Adds on top of any time they still have.
create or replace function public.admin_add_period(p_studio uuid, p_plan text, p_months integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; st timestamptz; en timestamptz;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_plan not in ('pro', 'studio') then raise exception 'Pick Pro or Studio'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'Pick 1 to 36 months'; end if;
  select id, plan, plan_status, plan_until into s from public.studios where id = p_studio;
  if s.id is null then raise exception 'Studio not found'; end if;
  st := case when s.plan = p_plan and s.plan_until is not null and s.plan_until > now() and s.plan_status = 'active' then s.plan_until else now() end;
  en := st + make_interval(months => p_months);
  update public.studios set plan = p_plan, plan_status = 'active', plan_until = en, plan_started_at = case when s.plan = p_plan then plan_started_at else now() end where id = p_studio;
  insert into public.subscription_periods (studio_id, plan, months, starts_at, ends_at, source, created_by) values (p_studio, p_plan, p_months, st, en, 'payment', (select auth.uid()));
  insert into public.events (studio_id, kind, meta) values (p_studio, 'renewed', jsonb_build_object('plan', p_plan, 'months', p_months, 'until', en));
  insert into public.admin_audit (admin_id, action, studio_id, meta) values ((select auth.uid()), 'add_period', p_studio, jsonb_build_object('plan', p_plan, 'months', p_months));
  return jsonb_build_object('until', en);
end $$;
revoke all on function public.admin_add_period(uuid, text, integer) from public, anon;
grant execute on function public.admin_add_period(uuid, text, integer) to authenticated;

-- HQ: remove the last recorded stretch if it was a mistake
create or replace function public.admin_remove_period(p_period uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.subscription_periods; prev timestamptz;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from public.subscription_periods where id = p_period returning * into p;
  if p.id is null then return; end if;
  select max(ends_at) into prev from public.subscription_periods where studio_id = p.studio_id and source <> 'gift';
  update public.studios set plan_until = prev,
    plan = case when prev is null or prev < now() then 'free' else plan end,
    plan_status = 'active' where id = p.studio_id and plan_status in ('active', 'past_due');
  insert into public.admin_audit (admin_id, action, studio_id, meta) values ((select auth.uid()), 'remove_period', p.studio_id, jsonb_build_object('months', p.months));
end $$;
revoke all on function public.admin_remove_period(uuid) from public, anon;
grant execute on function public.admin_remove_period(uuid) to authenticated;

-- Gifts are recorded as periods too (so HQ shows the full history)
create or replace function public.apply_gift(p_gift uuid, p_studio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare gf public.plan_gifts;
begin
  select * into gf from public.plan_gifts where id = p_gift and cancelled_at is null;
  if gf.id is null or gf.until < current_date then return; end if;
  perform set_config('jovita.plan_change', 'on', true);
  update public.studios set plan = gf.plan, plan_status = 'gift', plan_until = (gf.until + 1)::timestamptz, plan_started_at = now() where id = p_studio;
  update public.plan_gifts set studio_id = p_studio, applied_at = coalesce(applied_at, now()) where id = gf.id;
  insert into public.subscription_periods (studio_id, plan, months, starts_at, ends_at, source)
    values (p_studio, gf.plan, greatest(0, (extract(year from age(gf.until, current_date)) * 12 + extract(month from age(gf.until, current_date)))::int), now(), (gf.until + 1)::timestamptz, 'gift');
  insert into public.events (studio_id, kind, meta) values (p_studio, 'gift', jsonb_build_object('plan', gf.plan, 'until', gf.until));
end $$;

-- Any plan with an end date goes back to Free when the date passes (paid or gift)
create or replace function public.admin_expire_gifts()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then return 0; end if;
  with x as (update public.studios set plan = 'free', plan_status = 'active', plan_until = null
             where plan <> 'free' and plan_status in ('gift', 'active', 'past_due') and plan_until is not null and plan_until < now() returning id)
  select count(*) into n from x;
  return n;
end $$;

create or replace function public.my_plan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; gid uuid;
begin
  select id, plan, plan_status, plan_until, trial_ends_at, trial_used into s from public.studios where id = public.my_studio_id();
  if s.id is null then return null; end if;
  if s.plan_status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at < now() then
    perform set_config('jovita.plan_change', 'on', true);
    update public.studios set plan = 'free', plan_status = 'active' where id = s.id;
    insert into public.events (studio_id, kind, meta) values (s.id, 'trial_ended', jsonb_build_object('plan', s.plan));
    s.plan := 'free'; s.plan_status := 'active';
  end if;
  if s.plan <> 'free' and s.plan_status in ('gift', 'active', 'past_due') and s.plan_until is not null and s.plan_until < now() then
    perform set_config('jovita.plan_change', 'on', true);
    update public.studios set plan = 'free', plan_status = 'active', plan_until = null where id = s.id;
    insert into public.events (studio_id, kind, meta) values (s.id, case when s.plan_status = 'gift' then 'gift_ended' else 'plan_ended' end, jsonb_build_object('plan', s.plan));
    s.plan := 'free'; s.plan_status := 'active'; s.plan_until := null;
  end if;
  if s.plan = 'free' then
    select g.id into gid from public.plan_gifts g join auth.users u on lower(u.email) = lower(g.email)
     where u.id = (select auth.uid()) and g.cancelled_at is null and g.until >= current_date and g.applied_at is null limit 1;
    if gid is not null then
      perform public.apply_gift(gid, s.id);
      select id, plan, plan_status, plan_until, trial_ends_at, trial_used into s from public.studios where id = s.id;
    end if;
  end if;
  return jsonb_build_object('plan', s.plan, 'status', s.plan_status, 'until', s.plan_until, 'trial_ends_at', s.trial_ends_at, 'trial_used', s.trial_used);
end $$;

-- Studios list in HQ: months paid and how active they've been (no money figures)
do $do$
declare d text := pg_get_functiondef('public.admin_studios(text, text, integer, integer)'::regprocedure); o text;
begin
  o := d;
  d := replace(d, 's.plan, s.plan_status, s.plan_until,', $b$s.plan, s.plan_status, s.plan_until,
             (select coalesce(sum(sp.months), 0) from public.subscription_periods sp where sp.studio_id = s.id and sp.source <> 'gift') months_paid,
             (select count(*) from public.events ev where ev.studio_id = s.id and ev.created_at > now() - interval '30 days') actions_30d,$b$);
  if d = o then raise exception 'admin_studios was not as expected; nothing changed'; end if;
  execute d;
end $do$;

-- Run the renewal reminders every morning (08:00 Lagos = 07:00 UTC)
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'jovita-renewal-reminders';
select cron.schedule('jovita-renewal-reminders', '0 7 * * *',
  $c$select net.http_post(url := 'https://bdyjlmgjtrzqmohkklcg.supabase.co/functions/v1/renewal-reminders', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb)$c$);
