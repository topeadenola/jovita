-- Jovita update 18: two-step sign-in really protects the data.
-- If a studio owner has turned on two-step sign-in, their data can only be read or changed after the code is entered,
-- even if someone has their password. People without two-step sign-in are not affected. Client pages and galleries are not affected.
-- Paste into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

do $do$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity loop
    execute format('drop policy if exists "two-step" on public.%I', t.relname);
    execute format('create policy "two-step" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t.relname);
  end loop;
end $do$;
