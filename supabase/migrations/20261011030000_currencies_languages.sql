-- Add West African CFA franc (XOF) and euro (EUR); let each studio pick its app language.
do $$
declare r record;
begin
  for r in select * from (values
    ('invoices','currency'),('projects','currency'),('session_types','currency'),('templates','currency'),
    ('expenses','currency'),('subscriptions','currency'),('studios','home_currency')) as v(tbl, col)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl || '_' || r.col || '_check');
    execute format('alter table public.%I add constraint %I check (%I in (''NGN'',''GBP'',''USD'',''XOF'',''EUR''))', r.tbl, r.tbl || '_' || r.col || '_check', r.col);
  end loop;
end $$;

-- '' means "follow the device / location"
alter table public.studios add column language text not null default ''
  check (language in ('', 'en', 'fr', 'es', 'pt', 'sw'));
