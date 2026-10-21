-- Jovita update 20: new storage sizes (Free 500 MB, Pro 600 GB, Studio 1 TB), extra storage you can buy
-- (250 GB for $5 a month), and moving gallery photos to Cloudflare R2.
-- Run updates 17 and 19 first. Paste into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- Extra storage bought through Lemon Squeezy (one row per add-on subscription)
create table if not exists public.storage_addons (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  lemon_subscription_id text not null unique,
  gb integer not null default 250 check (gb > 0),
  status text not null default 'active',
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists storage_addons_studio_idx on public.storage_addons (studio_id);
alter table public.storage_addons enable row level security;
drop policy if exists "admins" on public.storage_addons;
create policy "admins" on public.storage_addons for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "own studio reads" on public.storage_addons;
create policy "own studio reads" on public.storage_addons for select to authenticated using (studio_id = (select public.my_studio_id()));

-- Extra storage that still counts: active, or cancelled but paid until a date that hasn't passed
create or replace function public.addon_bytes(p_studio uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.gb), 0)::bigint * 1024 * 1024 * 1024 from public.storage_addons a
   where a.studio_id = p_studio and (a.status in ('active', 'on_trial', 'past_due') or (a.status = 'cancelled' and coalesce(a.ends_at, now()) > now()));
$$;
revoke all on function public.addon_bytes(uuid) from public, anon;
grant execute on function public.addon_bytes(uuid) to authenticated, service_role;

-- Bytes used, and the plan's limit plus any extra storage
create or replace function public.storage_quota()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', coalesce((select sum(bytes) from public.gallery_photos where studio_id = s.id), 0),
    'limit', case when s.plan = 'studio' and s.plan_status <> 'trialing' then 1024::bigint * 1024 * 1024 * 1024
                  when s.plan in ('pro', 'studio') then 600::bigint * 1024 * 1024 * 1024
                  else 500::bigint * 1024 * 1024 end
             + case when s.plan <> 'free' and s.plan_status <> 'trialing' then public.addon_bytes(s.id) else 0 end,
    'extra', public.addon_bytes(s.id),
    'plan', coalesce(s.plan, 'free'))
  from public.studios s where s.id = public.my_studio_id()
$$;
revoke all on function public.storage_quota() from public, anon;
grant execute on function public.storage_quota() to authenticated;

-- Same numbers for the upload signer (it acts for a given studio)
create or replace function public.storage_quota_for(p_studio uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', coalesce((select sum(bytes) from public.gallery_photos where studio_id = s.id), 0),
    'limit', case when s.plan = 'studio' and s.plan_status <> 'trialing' then 1024::bigint * 1024 * 1024 * 1024
                  when s.plan in ('pro', 'studio') then 600::bigint * 1024 * 1024 * 1024
                  else 500::bigint * 1024 * 1024 end
             + case when s.plan <> 'free' and s.plan_status <> 'trialing' then public.addon_bytes(s.id) else 0 end,
    'plan', coalesce(s.plan, 'free'))
  from public.studios s where s.id = p_studio
$$;
revoke all on function public.storage_quota_for(uuid) from public, anon, authenticated;
grant execute on function public.storage_quota_for(uuid) to service_role;

-- Payment webhook: an extra-storage subscription started, renewed, was cancelled or ended
create or replace function public.lemon_addon_sync(p_studio uuid, p_sub text, p_status text, p_ends timestamptz, p_gb integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_addons (studio_id, lemon_subscription_id, gb, status, ends_at)
  values (p_studio, p_sub, coalesce(p_gb, 250), p_status, p_ends)
  on conflict (lemon_subscription_id) do update set status = excluded.status, ends_at = excluded.ends_at;
end $$;
revoke all on function public.lemon_addon_sync(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.lemon_addon_sync(uuid, text, text, timestamptz, integer) to service_role;

-- Payment webhook: money from an extra-storage payment (shows in HQ › Revenue)
create or replace function public.lemon_addon_paid(p_studio uuid, p_amount numeric, p_currency text, p_invoice text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.billing_payments where provider = 'lemonsqueezy' and reference = 'ls:' || p_invoice) then return; end if;
  insert into public.billing_payments (studio_id, plan, amount, currency, provider, status, reference, paid_at)
  values (p_studio, 'storage', round(coalesce(p_amount, 0), 2), upper(coalesce(nullif(p_currency, ''), 'USD')), 'lemonsqueezy', 'paid', 'ls:' || p_invoice, now());
end $$;
revoke all on function public.lemon_addon_paid(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.lemon_addon_paid(uuid, numeric, text, text) to service_role;

-- Moving photos to R2: the list of files still in Supabase Storage (used by the HQ "Move photos" button)
create or replace function public.admin_media_list(p_after text, p_n integer)
returns table (name text, size bigint, mimetype text, total bigint) language sql stable security definer set search_path = '' as $$
  select o.name, coalesce((o.metadata->>'size')::bigint, 0), coalesce(o.metadata->>'mimetype', 'application/octet-stream'),
         (select count(*) from storage.objects x where x.bucket_id = 'gallery-photos')
    from storage.objects o
   where o.bucket_id = 'gallery-photos' and o.name > coalesce(p_after, '')
   order by o.name limit greatest(1, least(p_n, 200));
$$;
revoke all on function public.admin_media_list(text, integer) from public, anon, authenticated;
grant execute on function public.admin_media_list(text, integer) to service_role;
