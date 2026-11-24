-- Equipos de venta y metas por equipo. Reglas propuestas:
--   * Un equipo tiene nombre, un líder opcional y miembros; cada persona está en un solo equipo.
--   * Una meta de equipo suma lo que venden (o crean/hacen) sus miembros actuales; no lleva vendedor.
--   * Los administra quien administra la estructura (admin.structure); toda la organización los ve.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 2 and 120),
  leader_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name),
  foreign key (leader_id, organization_id) references public.profiles(id, organization_id)
);
create table public.team_members (
  team_id uuid not null,
  profile_id uuid not null unique,
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  primary key (team_id, profile_id),
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id)
);
create trigger teams_set_updated_at before update on public.teams for each row execute function public.set_updated_at();
create trigger teams_audit after insert or update or delete on public.teams for each row execute function public.audit_row();
create trigger team_members_audit after insert or update or delete on public.team_members for each row execute function public.audit_row();

alter table public.teams enable row level security;
create policy teams_select on public.teams for select to authenticated using (organization_id = public.current_org_id());
create policy teams_write on public.teams for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'))
  with check (organization_id = public.current_org_id() and public.has_permission('admin.structure'));
alter table public.team_members enable row level security;
create policy team_members_select on public.team_members for select to authenticated using (organization_id = public.current_org_id());
create policy team_members_write on public.team_members for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'))
  with check (organization_id = public.current_org_id() and public.has_permission('admin.structure'));

alter table public.goals
  add column team_id uuid,
  add foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade,
  add constraint goals_team_or_owner check (team_id is null or owner_id is null);

drop function public.goals_progress();
create function public.goals_progress()
returns table (id uuid, name text, metric text, period_start date, period_end date, target numeric, currency_code text,
               owner_id uuid, office_id uuid, product_id uuid, actual numeric, unconverted bigint,
               company_id uuid, business_unit_id uuid, team_id uuid)
language sql stable security invoker set search_path = '' as $$
  select g.id, g.name, g.metric, g.period_start, g.period_end, g.target, g.currency_code, g.owner_id, g.office_id, g.product_id,
    case g.metric
      when 'revenue' then w.revenue
      when 'margin' then w.margin
      when 'units' then w.units
      when 'new_institutions' then (select count(*) from public.institutions i
        where public.local_date(i.created_at) between g.period_start and g.period_end
          and (g.owner_id is null or i.owner_id = g.owner_id) and (g.office_id is null or i.office_id = g.office_id)
          and (g.company_id is null or i.company_id = g.company_id)
          and (g.business_unit_id is null or i.business_unit_id = g.business_unit_id)
          and (g.team_id is null or i.owner_id in (select tm.profile_id from public.team_members tm where tm.team_id = g.team_id)))
      when 'activities' then (select count(*) from public.activities a
        left join public.institutions i on i.id = a.institution_id
        where a.status = 'done' and public.local_date(a.completed_at) between g.period_start and g.period_end
          and (g.owner_id is null or a.owner_id = g.owner_id)
          and (g.office_id is null or i.office_id = g.office_id)
          and (g.company_id is null or i.company_id = g.company_id)
          and (g.business_unit_id is null or i.business_unit_id = g.business_unit_id)
          and (g.team_id is null or a.owner_id in (select tm.profile_id from public.team_members tm where tm.team_id = g.team_id)))
    end,
    case when g.metric in ('revenue', 'margin') then w.unconverted else 0 end,
    g.company_id, g.business_unit_id, g.team_id
  from public.goals g
  cross join lateral (
    select coalesce(sum(c.amount_g), 0) as revenue, coalesce(sum(c.margin_g), 0) as margin, coalesce(sum(c.units), 0) as units,
           count(*) filter (where c.amount_g is null) as unconverted
    from (
      select f.units,
        public.convert_amount(f.amount, f.currency_code, g.currency_code, public.local_date(f.closed_at)) as amount_g,
        public.convert_amount(f.margin, f.currency_code, g.currency_code, public.local_date(f.closed_at)) as margin_g
      from public.opportunity_facts f
      where f.status = 'won' and public.local_date(f.closed_at) between g.period_start and g.period_end
        and (g.owner_id is null or f.owner_id = g.owner_id)
        and (g.office_id is null or f.office_id = g.office_id)
        and (g.product_id is null or f.product_id = g.product_id)
        and (g.company_id is null or f.company_id = g.company_id)
        and (g.business_unit_id is null or f.business_unit_id = g.business_unit_id)
        and (g.team_id is null or f.owner_id in (select tm.profile_id from public.team_members tm where tm.team_id = g.team_id))
    ) c
  ) w
  order by g.period_start desc, g.name
$$;
grant execute on function public.goals_progress() to authenticated;
