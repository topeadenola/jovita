-- Plans for studios: a free 7-day Pro trial (once per studio) and "I want to upgrade" requests.
-- Studios still can't give themselves a paid plan; only these functions (and admins) change it.

alter table public.studios add column if not exists trial_ends_at timestamptz;
alter table public.studios add column if not exists trial_used boolean not null default false;

-- Same guard as before, now also protecting the trial fields. Our own plan functions set a flag to pass.
create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('jovita.plan_change', true), '') = 'on' then return new; end if;
  if (select auth.uid()) is not null and not public.is_admin() then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
    new.trial_ends_at := old.trial_ends_at; new.trial_used := old.trial_used;
  end if;
  return new;
end $$;

-- The studio's plan right now. Ends an expired trial on the spot (no scheduler needed).
create or replace function public.my_plan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select id, plan, plan_status, trial_ends_at, trial_used into s from public.studios where id = public.my_studio_id();
  if s.id is null then return null; end if;
  if s.plan_status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at < now() then
    perform set_config('jovita.plan_change', 'on', true);
    update public.studios set plan = 'free', plan_status = 'active' where id = s.id;
    insert into public.events (studio_id, kind, meta) values (s.id, 'trial_ended', jsonb_build_object('plan', s.plan));
    s.plan := 'free'; s.plan_status := 'active';
  end if;
  return jsonb_build_object('plan', s.plan, 'status', s.plan_status, 'trial_ends_at', s.trial_ends_at, 'trial_used', s.trial_used);
end $$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Start the free Pro trial (once)
create or replace function public.start_pro_trial()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; ends timestamptz := now() + interval '7 days';
begin
  select id, name, plan, trial_used into s from public.studios where id = public.my_studio_id();
  if s.id is null then raise exception 'No studio'; end if;
  if s.plan <> 'free' then return jsonb_build_object('error', 'already_paid'); end if;
  if s.trial_used then return jsonb_build_object('error', 'trial_used'); end if;
  perform set_config('jovita.plan_change', 'on', true);
  update public.studios set plan = 'pro', plan_status = 'trialing', plan_started_at = now(), trial_ends_at = ends, trial_used = true where id = s.id;
  insert into public.events (studio_id, kind, meta) values (s.id, 'trial_started', jsonb_build_object('plan', 'pro'));
  insert into public.admin_notifications (kind, title, body, studio_id) values ('trial', 'Pro trial started', coalesce(s.name, 'A studio') || ' is trying Pro for 7 days', s.id);
  return jsonb_build_object('plan', 'pro', 'status', 'trialing', 'trial_ends_at', ends);
end $$;
revoke all on function public.start_pro_trial() from public, anon;
grant execute on function public.start_pro_trial() to authenticated;

-- "I want Pro / Studio": until billing is connected this tells HQ so you can follow up
create or replace function public.request_upgrade(p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if p_plan not in ('pro', 'studio') then raise exception 'Unknown plan'; end if;
  select id, name, plan into s from public.studios where id = public.my_studio_id();
  if s.id is null then raise exception 'No studio'; end if;
  if exists (select 1 from public.events where studio_id = s.id and kind = 'upgrade_request' and created_at > now() - interval '1 day') then return; end if;
  insert into public.events (studio_id, kind, meta) values (s.id, 'upgrade_request', jsonb_build_object('plan', p_plan, 'from', s.plan));
  insert into public.admin_notifications (kind, title, body, studio_id) values ('upgrade_request', 'Wants to upgrade', coalesce(s.name, 'A studio') || ' asked for the ' || initcap(p_plan) || ' plan', s.id);
end $$;
revoke all on function public.request_upgrade(text) from public, anon;
grant execute on function public.request_upgrade(text) to authenticated;

-- Starting or ending a trial isn't an upgrade or a cancellation, so HQ's numbers stay honest
create or replace function public.ev_studio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rank_old int; rank_new int;
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.id, 'signup', jsonb_build_object('email', (select email from auth.users where id = new.owner_id)));
  else
    if new.onboarded is distinct from old.onboarded and new.onboarded then perform public.log_event(new.id, 'onboarded', jsonb_build_object('careers', new.careers)); end if;
    if new.plan is distinct from old.plan and new.plan_status <> 'trialing' and old.plan_status <> 'trialing' then
      rank_old := array_position(array['free','pro','studio'], old.plan); rank_new := array_position(array['free','pro','studio'], new.plan);
      perform public.log_event(new.id, case when new.plan = 'free' then 'cancel' when rank_new > rank_old then 'upgrade' else 'downgrade' end, jsonb_build_object('from', old.plan, 'to', new.plan));
    end if;
  end if;
  return new;
end $$;
