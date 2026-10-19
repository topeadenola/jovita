-- Jovita update 13: recording a payment in HQ also records the money, so Revenue shows what Jovita made.

create or replace function public.admin_add_period(p_studio uuid, p_plan text, p_months integer, p_amount numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; pid uuid;
begin
  r := public.admin_add_period(p_studio, p_plan, p_months);
  select id into pid from public.subscription_periods where studio_id = p_studio order by created_at desc limit 1;
  if coalesce(p_amount, 0) > 0 then
    insert into public.billing_payments (studio_id, plan, amount, currency, provider, status, reference, paid_at)
    values (p_studio, p_plan, round(p_amount, 2), upper(coalesce(nullif(p_currency, ''), 'NGN')), 'manual', 'paid', 'period:' || pid, now());
  end if;
  return r || jsonb_build_object('period', pid);
end $$;
revoke all on function public.admin_add_period(uuid, text, integer, numeric, text) from public, anon;
grant execute on function public.admin_add_period(uuid, text, integer, numeric, text) to authenticated;

-- Removing a payment record also removes the money it recorded
create or replace function public.admin_remove_period(p_period uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.subscription_periods; prev timestamptz;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from public.subscription_periods where id = p_period returning * into p;
  if p.id is null then return; end if;
  delete from public.billing_payments where reference = 'period:' || p.id;
  select max(ends_at) into prev from public.subscription_periods where studio_id = p.studio_id and source <> 'gift';
  update public.studios set plan_until = prev,
    plan = case when prev is null or prev < now() then 'free' else plan end,
    plan_status = 'active' where id = p.studio_id and plan_status in ('active', 'past_due');
  insert into public.admin_audit (admin_id, action, studio_id, meta) values ((select auth.uid()), 'remove_period', p.studio_id, jsonb_build_object('months', p.months));
end $$;
