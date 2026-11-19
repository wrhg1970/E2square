-- Datos ficticios para desarrollo local. Nunca usar en producción.
-- Crea la organización, sus roles y la invitación del primer administrador.
-- Después crea ese usuario en Supabase Studio (Authentication > Add user, Auto Confirm) y entra con él.
select public.bootstrap_organization('E2Square', 'e2square', 'admin@e2square.test');

insert into public.companies (organization_id, legal_name, country_code)
select id, 'E2Square México (ficticia)', 'MX' from public.organizations where slug = 'e2square';
