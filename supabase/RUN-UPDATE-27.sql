-- Jovita update 27: every invoice and quote gets its own page for the client (no sign-in), even without a project.
-- The email's "View invoice" button opens it: the invoice, how to pay (your bank account), and a PDF download.
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

alter table public.invoices add column if not exists view_token uuid not null default gen_random_uuid();
create unique index if not exists invoices_view_token_key on public.invoices (view_token);

create or replace function public.invoice_view(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; s public.studios; c public.clients; p public.projects; banks jsonb;
begin
  select * into i from public.invoices where view_token = p_token and status <> 'draft';
  if i.id is null then return null; end if;
  select * into s from public.studios where id = i.studio_id;
  if s.suspended then return null; end if;
  select * into c from public.clients where id = i.client_id;
  if i.project_id is not null then select * into p from public.projects where id = i.project_id; end if;
  -- The studio's bank accounts for this currency (what clients already see on their client page)
  select coalesce(jsonb_agg(a.details), '[]'::jsonb) into banks from public.payment_accounts a
   where a.studio_id = s.id and a.provider = 'bank' and a.enabled and (coalesce(a.details->>'currency', '') in ('', i.currency));
  if i.kind = 'invoice' and i.status = 'sent' and i.viewed_at is null then update public.invoices set viewed_at = now() where id = i.id; end if;
  return jsonb_build_object(
    'invoice', jsonb_build_object('number', i.number, 'kind', i.kind, 'status', i.status, 'label', i.label, 'amount', i.amount, 'amount_paid', i.amount_paid,
      'currency', i.currency, 'due_date', i.due_date, 'created_at', i.created_at, 'paid_at', i.paid_at, 'items', i.items, 'notes', i.notes,
      'discount', i.discount, 'discount_type', i.discount_type, 'tax_rate', i.tax_rate, 'schedule', i.schedule, 'methods', i.methods),
    'studio', jsonb_build_object('name', s.name, 'email', s.reply_email, 'plan', s.plan, 'logo_path', case when s.plan <> 'free' then s.logo_path end, 'bank_details', s.bank_details),
    'client', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone),
    'project', case when p.id is null then null else jsonb_build_object('title', p.title, 'portal_token', p.portal_token) end,
    'banks', banks);
end $$;
revoke all on function public.invoice_view(uuid) from public;
grant execute on function public.invoice_view(uuid) to anon, authenticated;
