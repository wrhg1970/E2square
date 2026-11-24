-- Plantillas de campaña. Reglas propuestas (pendientes de confirmar por Will):
--   * Una plantilla es una campaña marcada con is_template: guarda tipo, proveedor, moneda, presupuesto,
--     meta de leads, notas y la secuencia de pasos. No tiene audiencia, no se lanza y no cuenta en las cifras.
--   * Cualquier campaña (o plantilla) se puede copiar: la copia nace en borrador, sin audiencia, resultados,
--     tareas ni costo real; trae la secuencia y el segmento de audiencia del original para volver a aplicarlo.
--   * La marca de plantilla no se cambia después de crearla (se crea otra copia si hace falta).
alter table public.campaigns add column is_template boolean not null default false;

create or replace function public.campaigns_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_template <> old.is_template then
    raise exception 'Una campaña no se convierte en plantilla: crea una copia como plantilla.' using errcode = 'EB001';
  end if;
  if new.is_template and new.status <> 'draft' then
    raise exception 'Una plantilla no se lanza: crea una campaña a partir de ella.' using errcode = 'EB001';
  end if;
  if old.status = 'draft' and new.status = 'active' and new.launched_at is null then
    raise exception 'Usa "Lanzar campaña" para activarla.' using errcode = 'EB001';
  end if;
  if old.status in ('finished', 'cancelled') and new.status <> old.status then
    raise exception 'Una campaña terminada o cancelada no se reabre.' using errcode = 'EB001';
  end if;
  return new;
end $$;

-- Una plantilla no lleva audiencia.
create or replace function public.campaign_members_no_template()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.campaigns where id = new.campaign_id and is_template) then
    raise exception 'Una plantilla no lleva audiencia: crea una campaña a partir de ella.' using errcode = 'EB001';
  end if;
  return new;
end $$;
create trigger campaign_members_no_template before insert on public.campaign_members
for each row execute function public.campaign_members_no_template();
