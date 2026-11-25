-- Historial de envíos de Correos: qué correos salieron desde el CRM y con qué plantilla.
-- Reutiliza communications (mismas reglas de visibilidad: lo propio y lo de instituciones que se ven).
alter table public.communications
  add column if not exists sent_from_crm boolean not null default false,
  add column if not exists template_id uuid references public.email_templates(id) on delete set null;
create index if not exists communications_crm_sent on public.communications (organization_id, sent_at desc) where sent_from_crm;
