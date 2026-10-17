-- Jovita questions: Free gets 10 in total to try it, Pro 300 a month, Studio unlimited.
-- Plan changes: studios can ask to upgrade or downgrade; HQ is told either way.

create or replace function public.jovita_quota()
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select id, coalesce(plan, 'free') as plan, suspended from public.studios where id = public.my_studio_id()),
       u as (select count(*)::int as used_all,
                    count(*) filter (where created_at >= date_trunc('month', now()))::int as used_month,
                    count(*) filter (where created_at > now() - interval '1 minute')::int as last_min
             from public.ai_usage where studio_id = (select id from s))
  select jsonb_build_object(
    'plan', s.plan, 'suspended', s.suspended, 'last_minute', u.last_min,
    'period', case when s.plan = 'free' then 'total' else 'month' end,
    'used', case when s.plan = 'free' then u.used_all else u.used_month end,
    'limit', case s.plan when 'studio' then null when 'pro' then 300 else 10 end)
  from s, u
$$;
revoke all on function public.jovita_quota() from public, anon;
grant execute on function public.jovita_quota() to authenticated;

-- Replaces the upgrade-only version: 'free', 'pro' or 'studio'
create or replace function public.request_upgrade(p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; up boolean; cur text;
begin
  if p_plan not in ('free', 'pro', 'studio') then raise exception 'Unknown plan'; end if;
  select id, name, plan, plan_status into s from public.studios where id = public.my_studio_id();
  if s.id is null then raise exception 'No studio'; end if;
  cur := case when s.plan_status = 'trialing' then 'free' else s.plan end; -- a trial isn't a paid plan yet
  if p_plan = cur then return; end if;
  up := array_position(array['free','pro','studio'], p_plan) > array_position(array['free','pro','studio'], cur);
  if exists (select 1 from public.events where studio_id = s.id and kind in ('upgrade_request', 'downgrade_request') and meta->>'plan' = p_plan and created_at > now() - interval '1 day') then return; end if;
  insert into public.events (studio_id, kind, meta) values (s.id, case when up then 'upgrade_request' else 'downgrade_request' end, jsonb_build_object('plan', p_plan, 'from', cur));
  insert into public.admin_notifications (kind, title, body, studio_id)
  values (case when up then 'upgrade_request' else 'downgrade_request' end, case when up then 'Wants to upgrade' else 'Wants to downgrade' end,
          coalesce(s.name, 'A studio') || ' asked to move from ' || initcap(cur) || case when s.plan_status = 'trialing' then ' (on a Pro trial)' else '' end || ' to ' || initcap(p_plan), s.id);
end $$;
revoke all on function public.request_upgrade(text) from public, anon;
grant execute on function public.request_upgrade(text) to authenticated;

-- ---------- Offers: a discount you set in HQ ----------
-- Shows on the website and on the plans screen in the app. It's for NEW subscriptions only:
-- studios already paying keep the price they signed up at (billing will store each subscription's own price).
create table if not exists public.plan_offers (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('pro', 'studio')),
  percent_off integer not null check (percent_off between 1 and 90),
  label text not null default '' check (char_length(label) <= 60),
  months integer check (months is null or months between 1 and 36), -- how long the new subscriber pays the lower price; null = for as long as they stay
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.plan_offers enable row level security;
drop policy if exists "admins manage offers" on public.plan_offers;
create policy "admins manage offers" on public.plan_offers for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- What the website and the app show: prices plus any live offer (one per plan, the biggest)
create or replace function public.public_pricing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'prices', (select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'currency', currency, 'monthly_amount', monthly_amount)), '[]'::jsonb) from public.plan_prices),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'percent_off', percent_off, 'label', label, 'months', months, 'ends_at', ends_at)), '[]'::jsonb)
               from (select distinct on (plan) * from public.plan_offers
                     where active and starts_at <= now() and (ends_at is null or ends_at > now())
                     order by plan, percent_off desc) o)
  )
$$;
revoke all on function public.public_pricing() from public;
grant execute on function public.public_pricing() to anon, authenticated;
