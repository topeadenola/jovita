-- Jovita update 36: quotes where the client chooses.
-- Nothing is picked for them, they must choose one option in each group before accepting,
-- and they can also ask you to review the pricing or decline (you get an email either way).
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

-- Part 1: what the client said
alter table public.invoices add column if not exists review_at timestamptz;
alter table public.invoices add column if not exists review_note text;
alter table public.invoices add column if not exists declined_at timestamptz;
alter table public.invoices add column if not exists decline_note text;
alter table public.invoices add column if not exists reply_emailed_at timestamptz;

-- Part 2: a "choose one" group with no pick counts as nothing picked (it used to keep the first option)
create or replace function public.quote_apply_picks(p_items jsonb, p_picks jsonb)
returns jsonb language sql immutable set search_path to '' as $$
  select coalesce(jsonb_agg(
    case
      when e->>'type' in ('optional', 'choice') then jsonb_set(e, '{selected}', to_jsonb(coalesce(p_picks ? (e->>'id'), false)
        and (e->>'type' = 'optional' or (e->>'id') = (select x->>'id' from jsonb_array_elements(p_items) with ordinality as g(x, o)
              where x->>'type' = 'choice' and x->>'group' = e->>'group' and p_picks ? (x->>'id') order by o limit 1))))
      else e end order by ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord);
$$;

-- Part 3: accepting needs one pick in every "choose one" group
create or replace function public.portal_accept_quote_v2(p_token uuid, p_invoice uuid, p_picks jsonb)
returns boolean language plpgsql security definer set search_path to '' as $$
declare pid uuid; cid uuid; inv public.invoices; its jsonb; opts boolean;
begin
  select id, client_id into pid, cid from public.projects where portal_token = p_token;
  if pid is null then return false; end if;
  select * into inv from public.invoices where id = p_invoice and project_id = pid and kind = 'quote' and status = 'sent' for update;
  if inv.id is null then return false; end if;
  opts := exists (select 1 from jsonb_array_elements(coalesce(inv.items, '[]'::jsonb)) e where e->>'type' in ('choice', 'optional'));
  its := case when opts then public.quote_apply_picks(inv.items, coalesce(p_picks, '[]'::jsonb)) else inv.items end;
  if exists (select 1 from jsonb_array_elements(its) e where e->>'type' = 'choice' group by e->>'group'
             having not bool_or(coalesce((e->>'selected')::boolean, false))) then
    raise exception 'Choose one option in each group first.';
  end if;
  update public.invoices
     set kind = 'invoice', accepted_at = now(), status = 'sent', viewed_at = coalesce(viewed_at, now()),
         due_date = greatest(coalesce(due_date, current_date), current_date + 3),
         items = its, review_at = null,
         amount = case when opts then public.quote_total(its, inv.discount, inv.discount_type, inv.tax_rate) else amount end
   where id = inv.id;
  update public.projects set stage = case when stage = 'inquiry' then 'booked' else stage end where id = pid;
  update public.clients set status = 'client' where id = cid;
  return true;
end $$;

-- Part 4: "Review pricing" or "Decline" from the client page (also lands in your Inbox)
create or replace function public.portal_quote_reply(p_token uuid, p_invoice uuid, p_action text, p_note text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare p record; inv public.invoices; note text := left(trim(coalesce(p_note, '')), 2000);
begin
  if p_action not in ('review', 'decline') then raise exception 'Bad request'; end if;
  if p_action = 'review' and char_length(note) = 0 then raise exception 'Tell them what you would like changed.'; end if;
  select id, studio_id, client_id into p from public.projects where portal_token = p_token;
  if not found then return false; end if;
  select * into inv from public.invoices where id = p_invoice and project_id = p.id and kind = 'quote' and status = 'sent' for update;
  if inv.id is null then return false; end if;
  if p_action = 'decline' then
    update public.invoices set status = 'cancelled', declined_at = now(), decline_note = nullif(note, ''), reply_emailed_at = null where id = inv.id;
  else
    update public.invoices set review_at = now(), review_note = note, reply_emailed_at = null where id = inv.id;
  end if;
  insert into public.messages (studio_id, client_id, channel, from_client, body)
  values (p.studio_id, p.client_id, 'portal', true,
    case when p_action = 'decline' then 'Declined quote #' || inv.number || coalesce(': ' || nullif(note, ''), '')
         else 'Asked you to review the pricing on quote #' || inv.number || ': ' || note end);
  return true;
end $$;
revoke all on function public.portal_quote_reply(uuid, uuid, text, text) from public;
grant execute on function public.portal_quote_reply(uuid, uuid, text, text) to anon, authenticated;

-- Part 5: the client page knows they already asked for changes
do $$
declare d text;
begin
  d := pg_get_functiondef('public.get_portal'::regproc);
  if position('''review_at''' in d) = 0 then
    d := replace(d, $q$'accepted_at', i.accepted_at,$q$, $q$'accepted_at', i.accepted_at, 'review_at', i.review_at,$q$);
    if position('''review_at''' in d) = 0 then raise exception 'Could not update get_portal: tell Claude'; end if;
    execute d;
  end if;
end $$;
