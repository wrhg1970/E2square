-- Datos ficticios para desarrollo local. Nunca usar en producción.
-- Crea la organización, sus roles y la invitación del primer administrador.
-- Después crea ese usuario en Supabase Studio (Authentication > Add user, Auto Confirm) y entra con él.
select public.bootstrap_organization('E2Square', 'e2square', 'admin@e2square.test');

insert into public.companies (organization_id, legal_name, country_code)
select id, 'E2Square México (ficticia)', 'MX' from public.organizations where slug = 'e2square';

-- Instituciones y contactos de ejemplo (ficticios).
with org as (select id from public.organizations where slug = 'e2square'),
ins as (
  insert into public.institutions (organization_id, name, institution_type, country_code, region, city, website, phone, status, potential, source, estimated_size, notes)
  select org.id, x.* from org, (values
    ('Colegio Hamilton (ejemplo)', 'school', 'MX', 'Puebla', 'Puebla', 'hamilton.example.mx', '+52 222 000 0001', 'prospect', 'high', 'Feria educativa', 650, 'Interesados en un piloto de 30 alumnos para cursos de invierno.'),
    ('Universidad del Valle (ejemplo)', 'university', 'MX', 'Jalisco', 'Guadalajara', 'udv.example.mx', null, 'active_client', 'medium', 'Referido', 12000, null),
    ('Grupo Educativo Andes (ejemplo)', 'education_group', 'CO', 'Cundinamarca', 'Bogotá', 'andes.example.co', null, 'prospect', 'high', 'Evento', null, null),
    ('Instituto Pacífico (ejemplo)', 'school', 'PE', 'Lima', 'Lima', null, '+51 1 000 0000', 'former_client', 'low', 'Base existente', 900, null)
  ) as x(name, institution_type, country_code, region, city, website, phone, status, potential, source, estimated_size, notes)
  returning id, organization_id, name
),
con as (
  insert into public.contacts (organization_id, first_name, last_name, email, phone)
  select organization_id, 'Sylvia', 'Estrada', 'sylvia@hamilton.example.mx', '+52 55 0000 0000' from ins where name like 'Colegio Hamilton%'
  returning id, organization_id
)
insert into public.institution_contacts (organization_id, institution_id, contact_id, job_title, decision_role, is_primary)
select con.organization_id, ins.id, con.id, 'Directora general', 'decision_maker', true
from con join ins on ins.name like 'Colegio Hamilton%';
