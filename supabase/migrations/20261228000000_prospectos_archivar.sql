-- Prospectos: archivar y borrar en grupo (pedido de Will, 2026-11-26).
--   * Archivar oculta el prospecto de la lista sin perderlo; se puede regresar.
--   * Borrar es definitivo; la bitácora (audit_row) guarda la fila borrada.
--   * Borran quienes pueden importar (import.run) y, como al editar, solo los que ven por su alcance.

alter table public.leads add column if not exists archived_at timestamptz;
create index if not exists leads_org_active on public.leads (organization_id, received_at desc) where archived_at is null;

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('import.run') and (
    public.has_permission('institutions.read_all') or owner_id = public.current_profile_id() or created_by = public.current_profile_id()));
grant delete on public.leads to authenticated;
