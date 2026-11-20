-- Fase 6a: Gmail y Google Calendar por usuario (OAuth de Google Workspace, app interna).
-- El refresh token llega cifrado (AES-256-GCM) desde el servidor de la app; la base nunca ve el token en claro.

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  profile_id uuid not null unique,
  google_email text not null,
  refresh_token_enc text not null,
  scopes text not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id) on delete cascade
);
create trigger google_connections_set_updated_at before update on public.google_connections
for each row execute function public.set_updated_at();

alter table public.google_connections enable row level security;
-- Cada quien solo ve y administra su propia conexión (ni el admin lee tokens ajenos).
create policy google_connections_own on public.google_connections for all to authenticated
  using (organization_id = public.current_org_id() and profile_id = public.current_profile_id())
  with check (organization_id = public.current_org_id() and profile_id = public.current_profile_id());

-- Correos registrados: solo metadatos y extracto, asociados a contacto e institución.
create table public.communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  owner_id uuid not null,
  channel text not null default 'email' check (channel in ('email')),
  direction text not null check (direction in ('inbound', 'outbound')),
  external_id text not null,
  thread_id text,
  subject text,
  snippet text,
  from_email text not null,
  to_emails text[] not null default '{}',
  sent_at timestamptz not null,
  contact_id uuid,
  institution_id uuid,
  created_at timestamptz not null default now(),
  unique (owner_id, external_id, contact_id),
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts(id, organization_id) on delete cascade,
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id) on delete cascade
);
create index communications_institution on public.communications (institution_id, sent_at desc);
create index communications_contact on public.communications (contact_id, sent_at desc);

alter table public.communications enable row level security;
create policy communications_select on public.communications for select to authenticated
  using (organization_id = public.current_org_id()
         and (owner_id = public.current_profile_id() or (institution_id is not null and public.can_see_institution_id(institution_id))));
create policy communications_insert on public.communications for insert to authenticated
  with check (organization_id = public.current_org_id() and owner_id = public.current_profile_id()
              and (institution_id is null or public.can_see_institution_id(institution_id)));
create policy communications_delete on public.communications for delete to authenticated
  using (organization_id = public.current_org_id() and owner_id = public.current_profile_id());

-- Evento de Google Calendar creado desde una actividad.
alter table public.activities add column google_event_id text;
