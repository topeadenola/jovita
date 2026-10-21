-- Jovita update 16: trials show as trials in HQ, not as paid upgrades.
-- Paste each part into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- Part 1: starting or ending a free trial is not an upgrade or a cancellation (no "Upgraded" event, no "Upgrade" bell)
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

-- Part 2: the HQ studios list also gets the trial end date
do $do$
declare d text := pg_get_functiondef('public.admin_studios(text, text, integer, integer)'::regprocedure);
begin
  if position('s.trial_ends_at' in d) > 0 then return; end if;
  d := replace(d, 's.plan, s.plan_status, s.plan_until,', 's.plan, s.plan_status, s.plan_until, s.trial_ends_at,');
  if position('s.trial_ends_at' in d) = 0 then raise exception 'admin_studios was not as expected; nothing changed'; end if;
  execute d;
end $do$;

-- Part 3: tidy up the "Upgraded Free → Pro" lines (and bell notices) that trials already created
delete from public.events e
 where e.kind = 'upgrade' and coalesce(e.meta->>'from', 'free') = 'free'
   and exists (select 1 from public.events t where t.studio_id = e.studio_id and t.kind = 'trial_started'
               and abs(extract(epoch from (t.created_at - e.created_at))) < 120);
delete from public.admin_notifications n
 where n.kind = 'upgrade'
   and exists (select 1 from public.events t where t.studio_id = n.studio_id and t.kind = 'trial_started'
               and abs(extract(epoch from (t.created_at - n.created_at))) < 120);
