-- Correos: plantillas compartidas por la organización, con variables {{...}} que se llenan con la institución y su contacto.
-- Reglas propuestas (pendientes de confirmar por Will):
--   * Todos los usuarios ven y usan las plantillas de su organización y pueden crear las suyas.
--   * Cada quien edita o borra las que creó; admin, direcciones y marketing editan o borran cualquiera (incluidas las iniciales).

insert into public.permissions (key, description) values
  ('email_templates.manage', 'Editar y borrar cualquier plantilla de correo')
on conflict (key) do nothing;

create or replace function public.grant_email_template_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organization_id, role_id, permission_key)
  select new.organization_id, new.id, 'email_templates.manage'
  where new.key in ('admin', 'general_director', 'sales_director', 'marketing')
  on conflict (role_id, permission_key) do nothing;
  return new;
end $$;
revoke execute on function public.grant_email_template_permissions() from public, anon, authenticated;
create trigger roles_grant_email_templates after insert on public.roles
for each row execute function public.grant_email_template_permissions();

insert into public.role_permissions (organization_id, role_id, permission_key)
select r.organization_id, r.id, 'email_templates.manage' from public.roles r
where r.key in ('admin', 'general_director', 'sales_director', 'marketing')
on conflict (role_id, permission_key) do nothing;

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category text not null check (category in ('first_contact', 'proposal', 'meeting', 'follow_up', 'customer')),
  title text not null check (length(trim(title)) between 2 and 200),
  subject text not null check (length(trim(subject)) between 2 and 300),
  body text not null check (length(trim(body)) between 2 and 20000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id) on delete set null (created_by)
);
create index email_templates_org on public.email_templates (organization_id, category, title);
create trigger email_templates_set_updated_at before update on public.email_templates
for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;
create policy email_templates_select on public.email_templates for select to authenticated
  using (organization_id = public.current_org_id());
create policy email_templates_insert on public.email_templates for insert to authenticated
  with check (organization_id = public.current_org_id() and created_by = public.current_profile_id());
create policy email_templates_update on public.email_templates for update to authenticated
  using (organization_id = public.current_org_id()
         and (created_by = public.current_profile_id() or public.has_permission('email_templates.manage')))
  with check (organization_id = public.current_org_id());
create policy email_templates_delete on public.email_templates for delete to authenticated
  using (organization_id = public.current_org_id()
         and (created_by = public.current_profile_id() or public.has_permission('email_templates.manage')));
grant select, insert, update, delete on public.email_templates to authenticated;

-- No se puede cambiar de dueño ni de organización al editar.
create or replace function public.email_templates_keep_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  new.organization_id := old.organization_id;
  return new;
end $$;
create trigger email_templates_keep_owner before update on public.email_templates
for each row execute function public.email_templates_keep_owner();

-- Plantillas iniciales, genéricas y editables, para cada organización (las de hoy y las nuevas).
create or replace function public.seed_email_templates(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.email_templates (organization_id, category, title, subject, body)
  select p_org, x.category, x.title, x.subject, x.body from (values
    ('first_contact', 'Presentación de E2 Square',
     'Programas educativos para {{nombre_institucion}}',
     E'Estimado/a {{contacto}}:\n\nMi nombre es {{mi_nombre}} y le escribo de E2 Square. Acompañamos a colegios y universidades con programas que fortalecen el aprendizaje y la proyección de sus alumnos: certificación TOEFL, Centro de Idiomas Digital, Evaluaciones, IHS, Arukay, E-Sports y Xplore Together.\n\nMe encantaría conocer los proyectos de {{nombre_institucion}} para este ciclo y ver si alguno de nuestros programas puede sumar. ¿Tendría 20 minutos esta semana o la próxima para una llamada?\n\nQuedo atento/a.\n\nSaludos cordiales,\n{{mi_nombre}}\nE2 Square'),
    ('first_contact', 'Certificación de inglés para sus alumnos',
     'Certificación internacional de inglés en {{nombre_institucion}}',
     E'Estimado/a {{contacto}}:\n\nMuchos colegios en {{ciudad}} ya certifican el nivel de inglés de sus alumnos con TOEFL y complementan con nuestro Centro de Idiomas Digital para prepararlos.\n\nPodemos aplicar la evaluación en las instalaciones de {{nombre_institucion}} y entregarle un reporte por grupo y por alumno. ¿Le comparto una propuesta con fechas y costos?\n\nSaludos,\n{{mi_nombre}}\nE2 Square'),
    ('proposal', 'Envío de propuesta económica',
     'Propuesta para {{nombre_institucion}}',
     E'Estimado/a {{contacto}}:\n\nGracias por su tiempo. Como acordamos, le comparto la propuesta para {{nombre_institucion}} con el alcance, las fechas y la inversión.\n\nSi le parece bien, podemos revisarla juntos en una llamada breve y resolver cualquier duda antes de presentarla a su comité.\n\nQuedo a sus órdenes.\n\nSaludos cordiales,\n{{mi_nombre}}\nE2 Square'),
    ('meeting', 'Confirmación de reunión',
     'Confirmación de nuestra reunión – {{nombre_institucion}}',
     E'Hola {{contacto}}:\n\nLe confirmo nuestra reunión para revisar los programas para {{nombre_institucion}}.\n\nFecha y hora: [escribir]\nLugar o enlace: [escribir]\n\nSi necesita moverla, con gusto buscamos otro horario.\n\nSaludos,\n{{mi_nombre}}\nE2 Square'),
    ('follow_up', 'Seguimiento después de la reunión',
     'Siguientes pasos con {{nombre_institucion}}',
     E'Estimado/a {{contacto}}:\n\nGracias por la reunión. Le resumo lo que platicamos y los siguientes pasos:\n\n1. [escribir]\n2. [escribir]\n\n¿Le parece si volvemos a hablar la próxima semana para avanzar?\n\nSaludos cordiales,\n{{mi_nombre}}\nE2 Square'),
    ('follow_up', 'Reactivar prospecto sin respuesta',
     '¿Seguimos con el proyecto de {{nombre_institucion}}?',
     E'Hola {{contacto}}:\n\nHace un tiempo platicamos sobre los programas de E2 Square para {{nombre_institucion}}. Sé que el ciclo escolar es intenso, así que le escribo para saber si el tema sigue en su agenda.\n\nSi ahora no es buen momento, dígame cuándo le conviene que lo retomemos.\n\nSaludos,\n{{mi_nombre}}\nE2 Square'),
    ('customer', 'Bienvenida a nuevo cliente',
     'Bienvenidos a E2 Square, {{nombre_institucion}}',
     E'Estimado/a {{contacto}}:\n\nGracias por confiar en E2 Square. Estamos muy contentos de trabajar con {{nombre_institucion}}.\n\nEn los próximos días le compartiré el calendario de implementación y los datos de contacto del equipo que les acompañará. Cualquier duda, estoy a sus órdenes.\n\nSaludos cordiales,\n{{mi_nombre}}\nE2 Square')
  ) x(category, title, subject, body);
$$;
revoke execute on function public.seed_email_templates(uuid) from public, anon, authenticated;

create or replace function public.organizations_seed_email_templates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_email_templates(new.id);
  return new;
end $$;
revoke execute on function public.organizations_seed_email_templates() from public, anon, authenticated;
create trigger organizations_seed_email_templates after insert on public.organizations
for each row execute function public.organizations_seed_email_templates();

select public.seed_email_templates(id) from public.organizations;
