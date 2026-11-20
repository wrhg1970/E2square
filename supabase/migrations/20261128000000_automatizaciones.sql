-- Fase 8a: automatizaciones comerciales internas (AUTOMATIONS.md, reglas sugeridas 1, 6 y 11).
-- Vienen apagadas: el administrador decide cuáles activar. Solo crean tareas internas; nunca envían mensajes.

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key text not null check (key in ('first_contact', 'won_handoff', 'owner_change')),
  enabled boolean not null default false,
  days int not null default 1 check (days between 0 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create trigger automation_rules_set_updated_at before update on public.automation_rules
for each row execute function public.set_updated_at();
create trigger automation_rules_audit after insert or update or delete on public.automation_rules
for each row execute function public.audit_row();

alter table public.automation_rules enable row level security;
create policy automation_rules_select on public.automation_rules for select to authenticated
  using (organization_id = public.current_org_id());
create policy automation_rules_insert on public.automation_rules for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('admin.structure'));
create policy automation_rules_update on public.automation_rules for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'))
  with check (organization_id = public.current_org_id());

-- Marca qué regla creó la tarea: historial visible y evita duplicados.
alter table public.activities add column automation_key text;

create or replace function public.run_opportunity_automations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rule_key text;
  subj text;
  kind text;
  r public.automation_rules;
begin
  if new.owner_id is null then return new; end if;
  if tg_op = 'INSERT' then
    rule_key := 'first_contact'; subj := 'Primer contacto: ' || new.name; kind := 'call';
  elsif new.status = 'won' and old.status <> 'won' then
    rule_key := 'won_handoff'; subj := 'Entrega a operación: ' || new.name; kind := 'internal_task';
  elsif new.owner_id is distinct from old.owner_id then
    rule_key := 'owner_change'; subj := 'Revisar oportunidad reasignada: ' || new.name; kind := 'follow_up';
  else
    return new;
  end if;

  select * into r from public.automation_rules where organization_id = new.organization_id and key = rule_key and enabled;
  if r.id is null then return new; end if;
  -- Idempotente: una tarea pendiente por regla, oportunidad y responsable.
  if exists (select 1 from public.activities where opportunity_id = new.id and automation_key = rule_key
             and owner_id = new.owner_id and status = 'pending') then
    return new;
  end if;

  insert into public.activities (organization_id, activity_type, subject, opportunity_id, owner_id, due_at, timezone, automation_key)
  select new.organization_id, kind, left(subj, 200), new.id, new.owner_id, now() + make_interval(days => r.days), p.timezone, rule_key
  from public.profiles p where p.id = new.owner_id;
  return new;
end;
$$;
revoke execute on function public.run_opportunity_automations() from public, anon, authenticated;

create trigger opportunities_automations after insert or update on public.opportunities
for each row execute function public.run_opportunity_automations();
