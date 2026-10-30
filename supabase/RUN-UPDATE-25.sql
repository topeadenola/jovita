-- Jovita update 25: emails from people who aren't clients stay in the Inbox.
-- Someone new emails you → they show in the Inbox as "Not a client yet", not in Clients.
-- You choose: Add as client, or Not a client (we delete them and ignore their emails from then on).
-- Paste each part into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

-- Part 1: a new "inbox" status, and a list of senders to ignore
alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients add constraint clients_status_check check (status = any (array['lead', 'client', 'inbox']));
alter table public.studios add column if not exists blocked_senders text[] not null default '{}';

-- Part 2: "Not a client": ignore their emails from now on and remove them (only people still in the Inbox)
create or replace function public.block_sender(p_client uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  select * into c from public.clients where id = p_client and studio_id = (select public.my_studio_id());
  if c.id is null then raise exception 'Not found'; end if;
  if c.status <> 'inbox' then raise exception 'Only people who are not clients yet can be removed this way.'; end if;
  if coalesce(c.email, '') <> '' then
    update public.studios set blocked_senders = array(select distinct unnest(blocked_senders || lower(c.email)))
     where id = c.studio_id;
  end if;
  delete from public.clients where id = c.id;
end $$;
revoke all on function public.block_sender(uuid) from public;
grant execute on function public.block_sender(uuid) to authenticated;

-- Part 3: tidy up. Leads that only ever emailed you (no project, invoice, booking, gallery, and you never replied)
-- move out of Clients and into the Inbox, where you decide. Nothing is deleted.
update public.clients c set status = 'inbox'
 where c.status = 'lead'
   and exists (select 1 from public.messages m where m.client_id = c.id and m.channel = 'email' and m.from_client)
   and not exists (select 1 from public.messages m where m.client_id = c.id and (not m.from_client or m.channel <> 'email'))
   and not exists (select 1 from public.projects x where x.client_id = c.id)
   and not exists (select 1 from public.invoices x where x.client_id = c.id)
   and not exists (select 1 from public.bookings x where x.client_id = c.id)
   and not exists (select 1 from public.galleries x where x.client_id = c.id);
