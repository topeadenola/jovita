-- Jovita update 31: everyone who downloads from a gallery is added to the studio's Clients (as a lead), with their
-- name and email, if they aren't there already. Paste into Supabase › SQL Editor › New query (project: jovita) and Run.
-- Safe to run more than once.

create or replace function public.gallery_add_downloader(p_token uuid, p_password text, p_email text, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; e text := left(lower(btrim(coalesce(p_email, ''))), 200); n text := left(btrim(coalesce(p_name, '')), 80);
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if exists (select 1 from public.clients c where c.studio_id = g.studio_id and lower(c.email) = e) then return; end if;
  insert into public.clients (studio_id, name, email, phone, city, status)
  values (g.studio_id, coalesce(nullif(n, ''), split_part(e, '@', 1)), e, '', '', 'lead');
end $$;
revoke all on function public.gallery_add_downloader(uuid, text, text, text) from public;
grant execute on function public.gallery_add_downloader(uuid, text, text, text) to anon, authenticated;
