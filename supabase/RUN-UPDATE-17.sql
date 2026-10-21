-- Jovita update 17: Lemon Squeezy payments. Paying for Pro or Studio switches the plan on by itself,
-- renews it every month or year, and records the money in HQ › Revenue.
-- Paste each part into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- Part 1: where we keep each studio's Lemon Squeezy subscription
alter table public.studios add column if not exists lemon_subscription_id text;
alter table public.studios add column if not exists lemon_customer_id text;
alter table public.studios add column if not exists plan_autorenew boolean not null default false;
create index if not exists studios_lemon_sub_idx on public.studios (lemon_subscription_id);

alter table public.billing_payments drop constraint if exists billing_payments_provider_check;
alter table public.billing_payments add constraint billing_payments_provider_check check (provider in ('paystack', 'stripe', 'manual', 'lemonsqueezy'));
create unique index if not exists billing_payments_lemon_ref on public.billing_payments (reference) where provider = 'lemonsqueezy';

-- Studios can't change their own subscription fields from the app
create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and coalesce(current_setting('jovita.plan_change', true), '') <> 'on' then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at; new.plan_until := old.plan_until;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
    new.lemon_subscription_id := old.lemon_subscription_id; new.lemon_customer_id := old.lemon_customer_id; new.plan_autorenew := old.plan_autorenew;
    if new.plan = 'free' and new.logo_path is not null and new.logo_path is distinct from old.logo_path then new.logo_path := old.logo_path; end if;
  end if;
  return new;
end $$;

-- Part 2: the subscription changed (started, renewed, failed, cancelled, ended). Called only by the payment webhook.
create or replace function public.lemon_sync(p_studio uuid, p_plan text, p_cycle text, p_status text, p_renews timestamptz, p_ends timestamptz, p_sub text, p_customer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; until_ timestamptz;
begin
  select id, plan, plan_status into s from public.studios where id = p_studio;
  if s.id is null then return jsonb_build_object('ok', false, 'why', 'no studio'); end if;
  if p_plan not in ('pro', 'studio') then return jsonb_build_object('ok', false, 'why', 'bad plan'); end if;
  if p_status in ('active', 'on_trial', 'past_due', 'unpaid') then
    -- a few days of grace after the renewal date while Lemon Squeezy retries the card
    until_ := coalesce(p_renews, now() + case when p_cycle = 'year' then interval '1 year' else interval '1 month' end) + interval '3 days';
    update public.studios set plan = p_plan, plan_status = case when p_status in ('past_due', 'unpaid') then 'past_due' else 'active' end,
      plan_until = until_, plan_cycle = case when p_cycle = 'year' then 'year' else 'month' end, plan_autorenew = true,
      plan_started_at = case when plan = p_plan and plan_status <> 'trialing' then plan_started_at else now() end,
      billing_provider = 'lemonsqueezy', lemon_subscription_id = p_sub, lemon_customer_id = coalesce(p_customer, lemon_customer_id)
    where id = p_studio;
  elsif p_status = 'cancelled' then
    -- keeps the plan until the end of what they paid for, then my_plan puts them back on Free
    update public.studios set plan = p_plan, plan_status = 'active', plan_until = coalesce(p_ends, plan_until), plan_autorenew = false,
      lemon_subscription_id = p_sub where id = p_studio;
  else -- expired, paused
    update public.studios set plan = 'free', plan_status = 'active', plan_until = null, plan_autorenew = false where id = p_studio;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lemon_sync(uuid, text, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.lemon_sync(uuid, text, text, text, timestamptz, timestamptz, text, text) to service_role;

-- Part 3: a payment went through (first payment or a renewal). Records the money once per invoice.
create or replace function public.lemon_paid(p_studio uuid, p_plan text, p_cycle text, p_amount numeric, p_currency text, p_invoice text, p_until timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m int := case when p_cycle = 'year' then 12 else 1 end; en timestamptz;
begin
  if exists (select 1 from public.billing_payments where provider = 'lemonsqueezy' and reference = 'ls:' || p_invoice) then
    return jsonb_build_object('ok', true, 'dup', true);
  end if;
  en := coalesce(p_until, now() + make_interval(months => m));
  insert into public.billing_payments (studio_id, plan, amount, currency, provider, status, reference, paid_at)
    values (p_studio, p_plan, round(coalesce(p_amount, 0), 2), upper(coalesce(nullif(p_currency, ''), 'NGN')), 'lemonsqueezy', 'paid', 'ls:' || p_invoice, now());
  insert into public.subscription_periods (studio_id, plan, months, starts_at, ends_at, source)
    values (p_studio, p_plan, m, now(), en, 'payment');
  insert into public.events (studio_id, kind, meta) values (p_studio, 'renewed', jsonb_build_object('plan', p_plan, 'months', m, 'until', en));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lemon_paid(uuid, text, text, numeric, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.lemon_paid(uuid, text, text, numeric, text, text, timestamptz) to service_role;

-- Part 4: a renewal payment failed
create or replace function public.lemon_failed(p_studio uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_event(p_studio, 'payment_failed', '{}'::jsonb);
end $$;
revoke all on function public.lemon_failed(uuid) from public, anon, authenticated;
grant execute on function public.lemon_failed(uuid) to service_role;
