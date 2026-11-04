-- Jovita update 34: more than one person on a project, quote or invoice (e.g. a bride and groom, or two people at a company).
-- Everyone gets the emails and the client page; only the main client signs and accepts.
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

alter table public.projects add column if not exists people uuid[] not null default '{}';
alter table public.invoices add column if not exists people uuid[] not null default '{}';

-- The invoice / quote page and the client page also send the other people's names (for "Bill to")
do $$
declare d text;
begin
  d := pg_get_functiondef('public.invoice_view'::regproc);
  if position('''people''' in d) = 0 then
    d := replace(d, $r$'company', c.company),$r$,
      $r$'company', c.company, 'people', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'company', x.company) order by x.name), '[]'::jsonb)
        from public.clients x where x.studio_id = i.studio_id and x.id <> c.id and x.id = any(i.people || coalesce(p.people, '{}'::uuid[])))),$r$);
    if position('''people''' in d) = 0 then raise exception 'Could not update invoice_view: tell Claude'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.get_portal'::regproc);
  if position('''people''' in d) = 0 then
    d := replace(d, $r$'address', c.address, 'company', c.company),$r$,
      $r$'address', c.address, 'company', c.company, 'people', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'company', x.company) order by x.name), '[]'::jsonb)
        from public.clients x where x.studio_id = p.studio_id and x.id <> c.id and x.id = any(p.people))),$r$);
    if position('''people''' in d) = 0 then raise exception 'Could not update get_portal: tell Claude'; end if;
    execute d;
  end if;
end $$;
