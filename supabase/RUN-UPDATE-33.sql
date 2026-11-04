-- Jovita update 33: clients can have a company (e.g. Onyeka, representing Global Cars).
-- It shows under the client's name on invoices, quotes and their page, and contracts can use {client_company}.
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

alter table public.clients add column if not exists company text not null default '';

-- The client's page and the invoice / quote page also send the company
do $$
declare d text;
begin
  d := pg_get_functiondef('public.get_portal'::regproc);
  if position('''company'', c.company' in d) = 0 then
    d := replace(d, $r$'address', c.address)$r$, $r$'address', c.address, 'company', c.company)$r$);
    if position('''company'', c.company' in d) = 0 then raise exception 'Could not update get_portal: tell Claude'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.invoice_view'::regproc);
  if position('''company'', c.company' in d) = 0 then
    d := replace(d, $r$'client', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone)$r$,
                    $r$'client', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'company', c.company)$r$);
    if position('''company'', c.company' in d) = 0 then raise exception 'Could not update invoice_view: tell Claude'; end if;
    execute d;
  end if;
end $$;
