-- Jovita update 11: your logo is a Pro and Studio feature, and the "Powered by Jovita" mark shows on Free only.

-- Client pages and galleries get the logo only for paid (or gifted / trial) plans, plus a "branded" flag
do $do$
declare f text; d text; o text;
begin
  foreach f in array array['public.get_portal(uuid)', 'public.open_gallery(uuid, text)'] loop
    d := pg_get_functiondef(f::regprocedure); o := d;
    d := replace(d, $a$'logo_path', s.logo_path$a$, $b$'logo_path', case when s.plan <> 'free' then s.logo_path end, 'branded', s.plan <> 'free'$b$);
    if d = o then raise exception '% was not as expected; nothing changed', f; end if;
    execute d;
  end loop;
end $do$;

-- Free studios can remove a logo but not add or change one
create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and coalesce(current_setting('jovita.plan_change', true), '') <> 'on' then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at; new.plan_until := old.plan_until;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
    if new.plan = 'free' and new.logo_path is not null and new.logo_path is distinct from old.logo_path then new.logo_path := old.logo_path; end if;
  end if;
  return new;
end $$;
