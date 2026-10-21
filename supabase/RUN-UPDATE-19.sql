-- Jovita update 19: downgrades happen at the next payment, not straight away.
-- Upgrades (Pro → Studio) start now. Downgrades (Studio → Pro, or to Free) keep what you paid for until the renewal date.
-- Run update 17 first. Paste into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

alter table public.studios add column if not exists plan_next text;
alter table public.studios add column if not exists plan_next_at timestamptz;

create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and coalesce(current_setting('jovita.plan_change', true), '') <> 'on' then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at; new.plan_until := old.plan_until;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
    new.lemon_subscription_id := old.lemon_subscription_id; new.lemon_customer_id := old.lemon_customer_id; new.plan_autorenew := old.plan_autorenew;
    new.plan_next := old.plan_next; new.plan_next_at := old.plan_next_at;
    if new.plan = 'free' and new.logo_path is not null and new.logo_path is distinct from old.logo_path then new.logo_path := old.logo_path; end if;
  end if;
  return new;
end $$;

create or replace function public.lemon_sync(p_studio uuid, p_plan text, p_cycle text, p_status text, p_renews timestamptz, p_ends timestamptz, p_sub text, p_customer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; until_ timestamptz; eff text := p_plan; nxt text; nxt_at timestamptz;
begin
  select id, plan, plan_status, plan_next, plan_next_at into s from public.studios where id = p_studio;
  if s.id is null then return jsonb_build_object('ok', false, 'why', 'no studio'); end if;
  if p_plan not in ('pro', 'studio') then return jsonb_build_object('ok', false, 'why', 'bad plan'); end if;
  nxt := s.plan_next; nxt_at := s.plan_next_at;
  -- A downgrade waiting for the renewal date: keep the higher plan until then
  if nxt is not null and p_plan = nxt and nxt_at is not null and now() < nxt_at - interval '1 hour' then
    eff := s.plan;
  elsif nxt is not null and (p_plan = nxt or p_plan = s.plan) then
    nxt := null; nxt_at := null; -- the change has happened, or was undone
  end if;
  if p_status in ('active', 'on_trial', 'past_due', 'unpaid') then
    until_ := coalesce(p_renews, now() + case when p_cycle = 'year' then interval '1 year' else interval '1 month' end) + interval '3 days';
    update public.studios set plan = eff, plan_status = case when p_status in ('past_due', 'unpaid') then 'past_due' else 'active' end,
      plan_until = until_, plan_cycle = case when p_cycle = 'year' then 'year' else 'month' end, plan_autorenew = true,
      plan_started_at = case when plan = eff and plan_status <> 'trialing' then plan_started_at else now() end,
      billing_provider = 'lemonsqueezy', lemon_subscription_id = p_sub, lemon_customer_id = coalesce(p_customer, lemon_customer_id),
      plan_next = nxt, plan_next_at = nxt_at
    where id = p_studio;
  elsif p_status = 'cancelled' then
    -- keeps the plan until the end of what they paid for, then my_plan puts them back on Free
    update public.studios set plan = eff, plan_status = 'active', plan_until = coalesce(p_ends, plan_until), plan_autorenew = false,
      lemon_subscription_id = p_sub, plan_next = 'free', plan_next_at = coalesce(p_ends, plan_until) where id = p_studio;
  else -- expired, paused
    update public.studios set plan = 'free', plan_status = 'active', plan_until = null, plan_autorenew = false, plan_next = null, plan_next_at = null where id = p_studio;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lemon_sync(uuid, text, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.lemon_sync(uuid, text, text, text, timestamptz, timestamptz, text, text) to service_role;
