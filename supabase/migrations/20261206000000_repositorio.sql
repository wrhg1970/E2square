-- Fase 7: repositorio completo. Documentos también en campañas, versiones y búsqueda central.
--   * Un documento puede ligarse a una campaña. Los de proveedor/producto o campaña (sin institución ni
--     oportunidad) los ve toda la organización, igual que el catálogo y las campañas.
--   * Suben a proveedores quienes administran el catálogo y a campañas quienes administran campañas.
--   * Versiones: una nueva versión comparte root_id con la original, hereda sus vínculos y categoría,
--     y toma el siguiente número. Las anteriores se conservan.

alter table public.documents
  add column campaign_id uuid,
  add column root_id uuid,
  add column version int not null default 1 check (version >= 1),
  add foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id);
update public.documents set root_id = id where root_id is null;
alter table public.documents alter column root_id set not null;
alter table public.documents add constraint documents_root_version unique (root_id, version);
create index documents_campaign_idx on public.documents (campaign_id);
create index documents_product_idx on public.documents (product_id);

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.documents'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%num_nonnulls%';
  execute format('alter table public.documents drop constraint %I', c);
end $$;
alter table public.documents add constraint documents_has_target
  check (num_nonnulls(institution_id, opportunity_id, product_id, campaign_id) >= 1);

-- Numera versiones (corre con los permisos de quien sube: solo versiona lo que puede ver).
create or replace function public.documents_version()
returns trigger language plpgsql set search_path = '' as $$
declare r public.documents;
begin
  if new.root_id is null or new.root_id = new.id then
    new.root_id := new.id; new.version := 1;
    return new;
  end if;
  select * into r from public.documents where root_id = new.root_id order by version desc limit 1;
  if not found then
    raise exception 'El documento original no existe o no lo puedes ver.' using errcode = 'EB001';
  end if;
  new.version := r.version + 1;
  new.institution_id := r.institution_id; new.opportunity_id := r.opportunity_id;
  new.product_id := r.product_id; new.campaign_id := r.campaign_id; new.category := r.category;
  return new;
end $$;
create trigger documents_version before insert on public.documents
for each row execute function public.documents_version();

create or replace function public.can_see_document(d public.documents)
returns boolean language sql stable security definer set search_path = '' as $$
  select d.organization_id = public.current_org_id() and (
    (d.institution_id is not null and public.can_see_institution_id(d.institution_id))
    or (d.opportunity_id is not null and public.can_see_opportunity_id(d.opportunity_id))
    or (d.institution_id is null and d.opportunity_id is null)
  )
$$;

drop policy documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    organization_id = public.current_org_id() and uploaded_by = public.current_profile_id()
    and (
      ((institution_id is not null or opportunity_id is not null)
        and public.has_permission('institutions.write')
        and (institution_id is null or public.can_see_institution_id(institution_id))
        and (opportunity_id is null or public.can_see_opportunity_id(opportunity_id)))
      or (institution_id is null and opportunity_id is null
        and (product_id is null or public.has_permission('catalog.manage'))
        and (campaign_id is null or public.has_permission('campaigns.manage')))
    )
  );

drop policy documents_objects_insert on storage.objects;
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_org_id()::text
              and (public.has_permission('institutions.write') or public.has_permission('catalog.manage')
                   or public.has_permission('campaigns.manage')));
