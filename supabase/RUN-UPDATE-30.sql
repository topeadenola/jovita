-- Jovita update 30: clients get an address, and the client's page fills it into contracts ({client_address}),
-- along with their phone and email. Paste into Supabase › SQL Editor › New query (project: jovita) and press Run.
-- Safe to run more than once.

alter table public.clients add column if not exists address text not null default '';

-- The client page (get_portal) also sends the client's phone, city and address, so contracts can use them
do $$
declare d text;
begin
  d := pg_get_functiondef('public.get_portal'::regproc);
  if position('''address'', c.address' in d) = 0 then
    d := replace(d, $r$'client', jsonb_build_object('name', c.name, 'email', c.email)$r$,
                    $r$'client', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'city', c.city, 'address', c.address)$r$);
    if position('''address'', c.address' in d) = 0 then raise exception 'Could not update get_portal: tell Claude'; end if;
    execute d;
  end if;
end $$;
