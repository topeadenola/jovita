-- Jovita update 29: quotes with options. Clients pick one from each "Client's choice" group and tick any optional extras,
-- then accept. The total is worked out here, from the studio's own prices, discount and tax (never from the browser).
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

-- The quote's items with the client's picks applied (ids of the chosen options and ticked extras)
create or replace function public.quote_apply_picks(p_items jsonb, p_picks jsonb)
returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(
    case
      when e->>'type' = 'optional' then jsonb_set(e, '{selected}', to_jsonb(coalesce(p_picks ? (e->>'id'), false)))
      when e->>'type' = 'choice' then (
        select case when pick is null then e else jsonb_set(e, '{selected}', to_jsonb((e->>'id') = pick)) end
        from (select (select x->>'id' from jsonb_array_elements(p_items) with ordinality as g(x, o)
                      where x->>'type' = 'choice' and x->>'group' = e->>'group' and p_picks ? (x->>'id') order by o limit 1) as pick) s)
      else e end order by ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord);
$$;

-- Total of the items that count (standard items, the picked option in each group, ticked extras), after discount and tax
create or replace function public.quote_total(p_items jsonb, p_discount numeric, p_discount_type text, p_tax_rate numeric)
returns numeric
language sql immutable set search_path = '' as $$
  with sub as (
    select coalesce(sum(coalesce(nullif(e->>'qty', '')::numeric, 0) * coalesce(nullif(e->>'price', '')::numeric, 0)), 0) as s
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where coalesce(e->>'type', 'standard') not in ('picture', 'choice', 'optional')
       or (e->>'type' in ('choice', 'optional') and coalesce((e->>'selected')::boolean, false))
  ), d as (
    select s, case when p_discount_type = 'percent' then s * coalesce(p_discount, 0) / 100 else coalesce(p_discount, 0) end as disc from sub
  )
  select round(greatest(0, s - disc) * (1 + coalesce(p_tax_rate, 0) / 100), 2) from d;
$$;

-- What the quote would cost with these picks (shown live on the client page)
create or replace function public.portal_quote_amount(p_token uuid, p_invoice uuid, p_picks jsonb)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare inv public.invoices;
begin
  select i.* into inv from public.invoices i join public.projects p on p.id = i.project_id
   where p.portal_token = p_token and i.id = p_invoice and i.kind = 'quote' and i.status = 'sent';
  if inv.id is null then return null; end if;
  return public.quote_total(public.quote_apply_picks(inv.items, coalesce(p_picks, '[]'::jsonb)), inv.discount, inv.discount_type, inv.tax_rate);
end $$;

-- Accept a quote with the client's picks: saves the picks, sets the amount, and turns it into an invoice (like before)
create or replace function public.portal_accept_quote_v2(p_token uuid, p_invoice uuid, p_picks jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare pid uuid; cid uuid; inv public.invoices; its jsonb; opts boolean;
begin
  select id, client_id into pid, cid from public.projects where portal_token = p_token;
  if pid is null then return false; end if;
  select * into inv from public.invoices where id = p_invoice and project_id = pid and kind = 'quote' and status = 'sent' for update;
  if inv.id is null then return false; end if;
  opts := exists (select 1 from jsonb_array_elements(coalesce(inv.items, '[]'::jsonb)) e where e->>'type' in ('choice', 'optional'));
  its := case when opts then public.quote_apply_picks(inv.items, coalesce(p_picks, '[]'::jsonb)) else inv.items end;
  update public.invoices
     set kind = 'invoice', accepted_at = now(), status = 'sent', viewed_at = coalesce(viewed_at, now()),
         due_date = greatest(coalesce(due_date, current_date), current_date + 3),
         items = its,
         amount = case when opts then public.quote_total(its, inv.discount, inv.discount_type, inv.tax_rate) else amount end
   where id = inv.id;
  update public.projects set stage = case when stage = 'inquiry' then 'booked' else stage end where id = pid;
  update public.clients set status = 'client' where id = cid;
  return true;
end $$;

revoke all on function public.quote_apply_picks(jsonb, jsonb) from public;
revoke all on function public.quote_total(jsonb, numeric, text, numeric) from public;
revoke all on function public.portal_quote_amount(uuid, uuid, jsonb) from public;
revoke all on function public.portal_accept_quote_v2(uuid, uuid, jsonb) from public;
grant execute on function public.portal_quote_amount(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.portal_accept_quote_v2(uuid, uuid, jsonb) to anon, authenticated;
