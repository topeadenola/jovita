-- Jovita v2.3: studios connect their own payment accounts (Paystack, Flutterwave, PayPal, Stripe, local banks)
-- Secret keys are write-only: the app can save or replace them, but nobody can read them back from the browser.

alter table public.studios add column if not exists pay_paypal boolean not null default false;
alter table public.invoices add column if not exists payment_method text;
alter table public.invoices add column if not exists payment_reference text;

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  provider text not null check (provider in ('paystack','flutterwave','paypal','stripe','bank')),
  enabled boolean not null default true,
  label text not null default '',
  public_key text not null default '',
  details jsonb not null default '{}'::jsonb,
  secret text,
  secret_hint text not null default '',
  test_mode boolean not null default false,
  connected_at timestamptz not null default now()
);
create index if not exists payment_accounts_studio_idx on public.payment_accounts (studio_id);
-- One account per provider, any number of bank accounts
create unique index if not exists payment_accounts_one_per_provider on public.payment_accounts (studio_id, provider) where provider <> 'bank';

alter table public.payment_accounts enable row level security;
drop policy if exists "studio rows" on public.payment_accounts;
create policy "studio rows" on public.payment_accounts for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- Everything readable except the secret
revoke all on public.payment_accounts from anon, authenticated;
grant select (id, studio_id, provider, enabled, label, public_key, details, secret_hint, test_mode, connected_at) on public.payment_accounts to authenticated;
grant insert, update, delete on public.payment_accounts to authenticated;

-- Client page: say how they paid (Paystack/Flutterwave/PayPal reference) so the studio can confirm
create or replace function public.portal_report_payment_v2(p_token uuid, p_invoice uuid, p_method text, p_reference text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.invoices i
     set payment_reported_at = now(), payment_method = left(coalesce(p_method, ''), 40), payment_reference = left(coalesce(p_reference, ''), 200)
    from public.projects p
   where p.portal_token = p_token and i.project_id = p.id and i.id = p_invoice and i.status = 'sent';
  return found;
end $$;
revoke all on function public.portal_report_payment_v2(uuid, uuid, text, text) from public;
grant execute on function public.portal_report_payment_v2(uuid, uuid, text, text) to anon, authenticated;

-- Client page data: add the studio's switched-on payment accounts (public parts only)
create or replace function public.get_portal(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'title', p.title, 'type', p.type, 'stage', p.stage, 'session_date', p.session_date,
       'amount', p.amount, 'currency', p.currency, 'contract_signed', p.contract_signed, 'deposit_paid', p.deposit_paid,
       'gallery_delivered', p.gallery_delivered, 'release_signed', p.release_signed),
    'client', jsonb_build_object('name', c.name, 'email', c.email),
    'studio', jsonb_build_object('name', s.name, 'logo_path', s.logo_path, 'pay_paystack', s.pay_paystack, 'pay_flutterwave', s.pay_flutterwave, 'pay_stripe', s.pay_stripe, 'pay_paypal', s.pay_paypal, 'pay_transfer', s.pay_transfer, 'bank_details', s.bank_details),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('provider', a.provider, 'label', a.label, 'public_key', a.public_key, 'details', a.details) order by a.connected_at)
        from public.payment_accounts a where a.studio_id = p.studio_id and a.enabled), '[]'::jsonb),
    'contract', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'contract'
                  and (t.id = p.contract_template_id or (p.contract_template_id is null and t.is_default)) order by (t.id = p.contract_template_id) desc limit 1),
    'release', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'model_release'
                  and (t.id = p.release_template_id or (p.release_template_id is null and t.is_default)) order by (t.id = p.release_template_id) desc limit 1),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'label', i.label, 'amount', i.amount, 'currency', i.currency,
        'due_date', i.due_date, 'status', i.status, 'payment_reported_at', i.payment_reported_at, 'items', i.items, 'notes', i.notes, 'methods', i.methods) order by i.due_date)
        from public.invoices i where i.project_id = p.id and i.status in ('sent','paid')), '[]'::jsonb),
    'booking', (select jsonb_build_object('starts_at', b.starts_at, 'location', b.location) from public.bookings b where b.project_id = p.id order by b.starts_at limit 1),
    'gallery', (select jsonb_build_object('title', g.title, 'photo_count', g.photo_count, 'status', g.status, 'share_token', g.share_token) from public.galleries g where g.project_id = p.id and g.status = 'delivered' limit 1)
  )
  from public.projects p
  join public.clients c on c.id = p.client_id
  join public.studios s on s.id = p.studio_id
  where p.portal_token = p_token
$$;
