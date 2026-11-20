-- Fase 7a: repositorio privado de documentos ligados a institución, oportunidad o producto.
-- El archivo vive en Storage (bucket privado "documents", ruta <organización>/<uuid>-<nombre>);
-- se descarga solo con URL firmada temporal y solo si el usuario ve el registro.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  category text not null default 'other' check (category in ('proposal', 'contract', 'presentation', 'price_list', 'material', 'other')),
  institution_id uuid,
  opportunity_id uuid,
  product_id uuid,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(institution_id, opportunity_id, product_id) >= 1),
  check (storage_path like organization_id::text || '/%'),
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id),
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id),
  foreign key (uploaded_by, organization_id) references public.profiles(id, organization_id)
);
create index documents_institution_idx on public.documents (institution_id);
create index documents_opportunity_idx on public.documents (opportunity_id);

create trigger documents_audit after insert or update or delete on public.documents
for each row execute function public.audit_row();

-- Ver un documento = ver aquello a lo que está ligado (los de producto son del catálogo: los ve toda la organización).
create or replace function public.can_see_document(d public.documents)
returns boolean language sql stable security definer set search_path = '' as $$
  select d.organization_id = public.current_org_id() and (
    (d.institution_id is not null and public.can_see_institution_id(d.institution_id))
    or (d.opportunity_id is not null and public.can_see_opportunity_id(d.opportunity_id))
    or (d.institution_id is null and d.opportunity_id is null and d.product_id is not null)
  )
$$;

alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated
  using (public.can_see_document(documents));
create policy documents_insert on public.documents for insert to authenticated
  with check (
    organization_id = public.current_org_id() and uploaded_by = public.current_profile_id()
    and public.has_permission('institutions.write')
    and (institution_id is null or public.can_see_institution_id(institution_id))
    and (opportunity_id is null or public.can_see_opportunity_id(opportunity_id))
    and (product_id is null or institution_id is not null or opportunity_id is not null or public.has_permission('catalog.manage'))
  );
-- Borra quien lo subió o un administrador.
create policy documents_delete on public.documents for delete to authenticated
  using (public.can_see_document(documents) and (uploaded_by = public.current_profile_id() or public.has_permission('admin.structure')));

-- ============ Storage ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Subir: solo dentro de la carpeta de tu organización y con permiso de escritura.
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_org_id()::text
              and public.has_permission('institutions.write'));
-- ¿La ruta pertenece a un documento registrado? (sin RLS: un archivo ajeno que no ves sigue "en uso").
create or replace function public.document_path_in_use(path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.documents where storage_path = path)
$$;

-- Leer (y firmar URLs): solo si ves el registro del documento (aplica la RLS de documents).
-- Un archivo huérfano (sin registro) solo lo ve quien lo subió o un admin, para poder limpiarlo.
create policy documents_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    exists (select 1 from public.documents d where d.storage_path = name)
    or ((storage.foldername(name))[1] = public.current_org_id()::text and not public.document_path_in_use(name)
        and (owner_id = auth.uid()::text or public.has_permission('admin.structure')))
  ));

-- Borrar: el archivo que subiste tú, o un administrador un archivo cuyo documento ya se borró.
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_org_id()::text
         and (owner_id = auth.uid()::text or (public.has_permission('admin.structure') and not public.document_path_in_use(name))));
