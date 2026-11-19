-- Datos ficticios para desarrollo local. Nunca usar en producción.
insert into public.organizations (name, slug, default_locale, default_currency)
values ('E2Square', 'e2square', 'es-MX', 'MXN')
on conflict (slug) do nothing;
