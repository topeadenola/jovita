-- Jovita update 10: gift Pro or Studio to people for a set time, and leave your own studio and gifts out of paying numbers.

-- A gifted plan: plan_status 'gift' until plan_until, then back to Free
alter table public.studios add column if not exists plan_until timestamptz;
alter table public.studios drop constraint if exists studios_plan_status_check;
alter table public.studios add constraint studios_plan_status_check check (plan_status in ('active', 'trialing', 'past_due', 'cancelled', 'gift'));

-- Plan changes made by Jovita itself (ending a trial or a gift, applying a gift) are allowed through
create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and coalesce(current_setting('jovita.plan_change', true), '') <> 'on' then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at; new.plan_until := old.plan_until;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
  end if;
  return new;
end $$;

create table if not exists public.plan_gifts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null check (plan in ('pro', 'studio')),
  until date not null,
  note text not null default '',
  studio_id uuid references public.studios(id) on delete set null,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists plan_gifts_open_email_idx on public.plan_gifts (lower(email)) where cancelled_at is null;
alter table public.plan_gifts enable row level security;
drop policy if exists "admins" on public.plan_gifts;
create policy "admins" on public.plan_gifts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Put a gift on a studio (used when it's created and when the gift is added)
create or replace function public.apply_gift(p_gift uuid, p_studio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare gf public.plan_gifts;
begin
  select * into gf from public.plan_gifts where id = p_gift and cancelled_at is null;
  if gf.id is null or gf.until < current_date then return; end if;
  perform set_config('jovita.plan_change', 'on', true);
  update public.studios set plan = gf.plan, plan_status = 'gift', plan_until = (gf.until + 1)::timestamptz, plan_started_at = now() where id = p_studio;
  update public.plan_gifts set studio_id = p_studio, applied_at = coalesce(applied_at, now()) where id = gf.id;
  insert into public.events (studio_id, kind, meta) values (p_studio, 'gift', jsonb_build_object('plan', gf.plan, 'until', gf.until));
end $$;
revoke all on function public.apply_gift(uuid, uuid) from public, anon, authenticated;

-- HQ: gift a plan to one or more emails until a date. People already on Jovita get it now; new people get it when they sign up.
create or replace function public.admin_gift_plan(p_emails text[], p_plan text, p_until date, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text; gid uuid; sid uuid; now_on int := 0; waiting int := 0;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_plan not in ('pro', 'studio') then raise exception 'Pick Pro or Studio'; end if;
  if p_until is null or p_until < current_date then raise exception 'Pick an end date from today on'; end if;
  foreach e in array p_emails loop
    e := lower(btrim(e));
    continue when e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    update public.plan_gifts set plan = p_plan, until = p_until, note = left(coalesce(p_note, ''), 200) where lower(email) = e and cancelled_at is null returning id into gid;
    if gid is null then
      insert into public.plan_gifts (email, plan, until, note, created_by) values (e, p_plan, p_until, left(coalesce(p_note, ''), 200), (select auth.uid())) returning id into gid;
    end if;
    select s.id into sid from public.studios s join auth.users u on u.id = s.owner_id where lower(u.email) = e limit 1;
    if sid is not null then perform public.apply_gift(gid, sid); now_on := now_on + 1; else waiting := waiting + 1; end if;
    gid := null; sid := null;
  end loop;
  insert into public.admin_audit (admin_id, action, meta) values ((select auth.uid()), 'gift_plan', jsonb_build_object('emails', p_emails, 'plan', p_plan, 'until', p_until));
  return jsonb_build_object('now', now_on, 'waiting', waiting);
end $$;
revoke all on function public.admin_gift_plan(text[], text, date, text) from public, anon;
grant execute on function public.admin_gift_plan(text[], text, date, text) to authenticated;

-- HQ: the list of gifts, with each person's status
create or replace function public.admin_gifts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'email', g.email, 'plan', g.plan, 'until', g.until, 'note', g.note, 'created_at', g.created_at,
    'applied_at', g.applied_at, 'studio_id', g.studio_id, 'studio', s.name,
    'state', case when g.until < current_date then 'ended' when g.applied_at is null then 'waiting' else 'on' end) order by g.created_at desc)
    from public.plan_gifts g left join public.studios s on s.id = g.studio_id where g.cancelled_at is null), '[]'::jsonb);
end $$;
revoke all on function public.admin_gifts() from public, anon;
grant execute on function public.admin_gifts() to authenticated;

-- HQ: take a gift back (their studio goes back to Free straight away)
create or replace function public.admin_cancel_gift(p_gift uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare gf public.plan_gifts;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.plan_gifts set cancelled_at = now() where id = p_gift and cancelled_at is null returning * into gf;
  if gf.studio_id is not null then
    update public.studios set plan = 'free', plan_status = 'active', plan_until = null where id = gf.studio_id and plan_status = 'gift';
  end if;
  insert into public.admin_audit (admin_id, action, studio_id, meta) values ((select auth.uid()), 'cancel_gift', gf.studio_id, jsonb_build_object('email', gf.email));
end $$;
revoke all on function public.admin_cancel_gift(uuid) from public, anon;
grant execute on function public.admin_cancel_gift(uuid) to authenticated;

-- HQ: end gifts whose time is up (called when HQ opens)
create or replace function public.admin_expire_gifts()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then return 0; end if;
  with x as (update public.studios set plan = 'free', plan_status = 'active', plan_until = null where plan_status = 'gift' and plan_until < now() returning id)
  select count(*) into n from x;
  return n;
end $$;
revoke all on function public.admin_expire_gifts() from public, anon;
grant execute on function public.admin_expire_gifts() to authenticated;

-- New sign-ups pick up a gift waiting for their email
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sid uuid; gid uuid;
begin
  insert into public.studios (owner_id, name, owner_first_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'studio_name',''), 'My studio'),
    coalesce(nullif(new.raw_user_meta_data->>'first_name',''), split_part(new.email,'@',1))
  ) returning id into sid;
  perform public.seed_templates(sid);
  select id into gid from public.plan_gifts where lower(email) = lower(new.email) and cancelled_at is null and until >= current_date limit 1;
  if gid is not null then perform public.apply_gift(gid, sid); end if;
  return new;
end $$;

-- The app asks for its plan on every open: ends a finished trial or gift, and picks up a gift added after sign-up
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
  if s.plan_status = 'gift' and s.plan_until is not null and s.plan_until < now() then
    perform set_config('jovita.plan_change', 'on', true);
    update public.studios set plan = 'free', plan_status = 'active', plan_until = null where id = s.id;
    insert into public.events (studio_id, kind, meta) values (s.id, 'gift_ended', jsonb_build_object('plan', s.plan));
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

-- Paying subscribers and monthly revenue: only studios really paying (not your own studio, not trials, not gifts)
do $do$
declare d text := pg_get_functiondef('public.admin_overview(integer)'::regprocedure); o text;
begin
  o := d;
  d := replace(d, $a$'paying', (select count(*) from public.studios where plan <> 'free' and plan_status in ('active','trialing')),$a$,
    $b$'paying', (select count(*) from public.studios s where s.plan <> 'free' and s.plan_status = 'active' and not exists (select 1 from public.admins a where a.user_id = s.owner_id)),
    'gifted', (select count(*) from public.studios where plan_status = 'gift'),$b$);
  d := replace(d, $a$'paying_prev', (select count(*) from public.studios where plan <> 'free' and created_at < since),$a$,
    $b$'paying_prev', (select count(*) from public.studios s where s.plan <> 'free' and s.plan_status = 'active' and s.created_at < since and not exists (select 1 from public.admins a where a.user_id = s.owner_id)),$b$);
  d := replace(d, $a$where s.plan <> 'free' and s.plan_status in ('active','trialing') group by s.home_currency$a$,
    $b$where s.plan <> 'free' and s.plan_status = 'active' and not exists (select 1 from public.admins a where a.user_id = s.owner_id) group by s.home_currency$b$);
  if d = o or position('gifted' in d) = 0 then raise exception 'admin_overview was not as expected; nothing changed'; end if;
  execute d;
end $do$;

-- Studios list in HQ also shows when a gift ends
do $do$
declare d text := pg_get_functiondef('public.admin_studios(text, text, integer, integer)'::regprocedure); o text;
begin
  o := d;
  d := replace(d, 'select s.id, s.name, s.owner_first_name, u.email, s.plan, s.plan_status,', 'select s.id, s.name, s.owner_first_name, u.email, s.plan, s.plan_status, s.plan_until,');
  if d = o then raise exception 'admin_studios was not as expected; nothing changed'; end if;
  execute d;
end $do$;
