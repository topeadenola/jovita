-- Jovita update 35: Spotlight stories can be longer, now that they hold formatted text, tables and pictures.
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

alter table public.spotlights drop constraint if exists spotlights_body_check;
alter table public.spotlights add constraint spotlights_body_check check (char_length(body) <= 200000);

-- Security tidy-up from the November check (nothing was exposed; these just add extra locks):
-- 1. The longer "add a paid period" admin function checks for an admin itself too
do $$
declare d text;
begin
  d := pg_get_functiondef('public.admin_add_period(uuid, text, integer, numeric, text)'::regprocedure);
  if position('Admins only' in d) = 0 then
    d := replace(d, E'declare r jsonb; pid uuid;\nbegin\n', E'declare r jsonb; pid uuid;\nbegin\n  if not public.is_admin() then raise exception ''Admins only''; end if;\n');
    if position('Admins only' in d) = 0 then raise exception 'Could not update admin_add_period: tell Claude'; end if;
    execute d;
  end if;
end $$;

-- 2. Two studio-only functions don't need to be callable by signed-out visitors
revoke execute on function public.block_sender(uuid) from anon, public;
revoke execute on function public.studio_inbox_name() from anon, public;
grant execute on function public.block_sender(uuid) to authenticated;
grant execute on function public.studio_inbox_name() to authenticated;
