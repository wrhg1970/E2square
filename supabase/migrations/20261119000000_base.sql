-- Fase 0: base común. Las tablas de empresas, oficinas, roles y permisos llegan en Fase 1.

create extension if not exists pgcrypto;

-- Mantiene updated_at en cada tabla que lo use.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Límite de tenant: todo dato de negocio colgará de una organización.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  default_locale text not null default 'es-MX',
  default_currency char(3) not null default 'MXN' check (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

-- RLS activo sin políticas = nadie con anon/authenticated lee ni escribe. Las políticas por ámbito llegan en Fase 1.
alter table public.organizations enable row level security;
