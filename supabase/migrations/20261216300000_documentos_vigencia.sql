-- Documentos: vigencia, título, descripción, nuevas categorías y documentos generales de la empresa.
--   * expires_on: fecha en que vence (contrato, acreditación, constancia). Vacío = sin vigencia.
--   * Documentos "General / Corporativo": sin institución, oportunidad, proveedor ni campaña. Los ve toda la
--     organización (can_see_document ya lo permite) y los sube quien tiene institutions.write.
--   * Editar (título, descripción, categoría, vigencia): quien lo subió o un administrador. Solo esas columnas.
--   * Una nueva versión hereda título y descripción, y la vigencia si no se captura otra.

alter table public.documents
  add column title text check (title is null or length(title) between 1 and 200),
  add column description text check (description is null or length(description) <= 1000),
  add column expires_on date;
create index documents_expires_idx on public.documents (expires_on) where expires_on is not null;

alter table public.documents drop constraint documents_category_check;
alter table public.documents add constraint documents_category_check check (category in
  ('proposal', 'contract', 'presentation', 'price_list', 'material', 'accreditation', 'legal', 'other'));

alter table public.documents drop constraint documents_has_target;

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
        and (product_id is not null or campaign_id is not null)
        and (product_id is null or public.has_permission('catalog.manage'))
        and (campaign_id is null or public.has_permission('campaigns.manage')))
      or (num_nonnulls(institution_id, opportunity_id, product_id, campaign_id) = 0
        and public.has_permission('institutions.write'))
    )
  );

create policy documents_update on public.documents for update to authenticated
  using (public.can_see_document(documents) and (uploaded_by = public.current_profile_id() or public.has_permission('admin.structure')))
  with check (organization_id = public.current_org_id());
-- Solo se editan los datos descriptivos; archivo, vínculos y versión no cambian.
revoke update on public.documents from authenticated, anon;
grant update (title, description, category, expires_on) on public.documents to authenticated;

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
  new.title := coalesce(new.title, r.title); new.description := coalesce(new.description, r.description);
  new.expires_on := coalesce(new.expires_on, r.expires_on);
  return new;
end $$;
