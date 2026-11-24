# Modelo de datos — base inicial

## Convenciones
UUID como PK; `created_at`, `updated_at`; `organization_id` para aislamiento; soft delete solo donde la retención lo permita; auditoría append-only para eventos críticos. Importes como `numeric(18,4)` y códigos ISO de moneda.

## Tablas principales (resumen)
- organizations(id, name, slug, default_locale, default_currency)
- companies(id, organization_id, legal_name, tax_id, country_code, status)
- business_units(id, organization_id, company_id, name, status)
- offices(id, organization_id, company_id, business_unit_id, name, country_code, timezone)
- territories(id, organization_id, name, parent_id)
- profiles(id, auth_user_id, organization_id, full_name, locale, timezone, status)
- roles(id, organization_id, name)
- permissions(id, key, description)
- role_permissions(role_id, permission_id)
- user_scopes(id, profile_id, scope_type, scope_id)
- institutions(id, organization_id, parent_institution_id, name, legal_name, institution_type, website, country_code, region, city, address, owner_id, office_id, territory_id, source, status, potential_score)
- institution_branches(id, institution_id, name, address, city, country_code)
- contacts(id, organization_id, first_name, last_name, email, phone, preferred_language, consent_status)
- institution_contacts(id, institution_id, contact_id, job_title, department, decision_role, is_primary)
- products(id, organization_id, company_id, business_unit_id, supplier_id, code, name, description, revenue_model, default_pipeline_id, active). Un registro sin supplier_id es un **proveedor** (tiene el pipeline); con supplier_id es un producto de ese proveedor (sin pipeline, un solo nivel). Las líneas de oportunidad usan productos del proveedor de su pipeline.
  El proveedor guarda además legal_name, tax_id, website, phone, email, address, city, state, postal_code, country y logo_path (bucket privado `logos`, PNG/JPG/WebP ≤ 2 MB, se muestra con URL firmada). Sus ventas se calculan de las oportunidades de su pipeline.
- supplier_contacts(id, organization_id, supplier_id, name, job_title, email, phone, notes, is_primary). Personas de enlace del proveedor; un solo principal. Las ve toda la organización; las cambia catalog.manage.
- price_books(id, product_id, name, currency_code, valid_from, valid_to, version)
- price_book_items(id, price_book_id, unit_price, unit_cost, unit_name)
- pipelines(id, organization_id, name, product_id, business_unit_id, active)
- pipeline_stages(id, pipeline_id, name, sort_order, default_probability, required_fields, is_won, is_lost)
- opportunities(id, organization_id, company_id, business_unit_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, expected_close_date, status, source_campaign_id, loss_reason)
- opportunity_items(id, opportunity_id, product_id, description, quantity, unit_price, discount, unit_cost, currency_code)
- opportunity_stage_history(id, opportunity_id, from_stage_id, to_stage_id, changed_by, changed_at, note)
- activities(id, organization_id, institution_id, contact_id, opportunity_id, activity_type, subject, owner_id, due_at, timezone, status, outcome, notes)
- tasks(id, activity_id, priority, completed_at, reminder_at)
- campaigns(id, organization_id, name, campaign_type, product_id, start_date, end_date, budget_amount, actual_cost, currency_code, owner_id, status draft|active|finished|cancelled, segment, launched_at, lead_goal opcional). lead_goal = meta de leads; lead = institución distinta con al menos una oportunidad marcada con la campaña. Solo se activa con launch_campaign(); campaign_results() calcula audiencia, respuestas, oportunidades, ganado y ROI.
- campaign_members(id, organization_id, campaign_id, institution_id, contact_id, consent_basis granted|unknown). Se agregan con add_campaign_members(); no se borran después del lanzamiento.
- communications(id, organization_id, channel, provider_message_id, contact_id, institution_id, opportunity_id, direction, subject, body_excerpt, sent_at, status). Implementado con channel email|whatsapp; WhatsApp usa from_phone y es único por (organization_id, external_id).
- whatsapp_accounts(id, organization_id, phone_number_id, display_phone, created_by, last_event_at) y whatsapp_secrets(account_id, app_secret, verify_token): secretos sin políticas RLS ni auditoría; la firma del webhook se verifica en whatsapp_ingest().
- documents(id, organization_id, storage_path, file_name, mime_type, size_bytes, category, institution_id, opportunity_id, product_id, campaign_id, uploaded_by, root_id, version). Una nueva versión comparte root_id, hereda vínculos y categoría (trigger documents_version). Los de proveedor o campaña los ve toda la organización.
- targets(id, organization_id, scope_type, scope_id, metric, period_start, period_end, target_value, currency_code)
- commission_plans(id, organization_id, name, version, effective_from, effective_to, rules_json, status)
- commission_entries(id, opportunity_id, beneficiary_user_id, gross_amount, currency_code, status, approved_by, paid_at)
- exchange_rates(id, base_currency, quote_currency, rate, effective_at, source)
- automation_rules(id, organization_id, name, trigger_type, conditions_json, actions_json, enabled)
- automation_runs(id, rule_id, entity_type, entity_id, idempotency_key, status, result_json, executed_at)
- audit_logs(id, organization_id, actor_id, entity_type, entity_id, action, before_json, after_json, created_at)
- integration_connections(id, organization_id, provider, account_label, scopes, status, token_reference, last_sync_at)
- integration_sync_logs(id, connection_id, operation, status, cursor, error_code, occurred_at)

## Relaciones clave
- Organization 1:N companies, profiles, institutions, products, pipelines, campaigns.
- Institution 1:N branches; Institution N:M contacts.
- Institution 1:N opportunities.
- Opportunity 1:N opportunity_items, activities, stage_history.
- Product 1:N price books and pipelines (configurable).
- Campaign N:M institutions/contacts via campaign_members.
- User N:M scopes and roles.

## Reglas
- Unique parcial para producto code por organización/empresa según política.
- Evitar duplicados de institución con índices auxiliares normalizados; fuzzy match en aplicación.
- Toda línea de oportunidad conserva precio/costo acordado como snapshot; cambios posteriores al catálogo no alteran ventas históricas.
- Commission plan se versiona; cada comisión conserva la regla aplicada.
- Nunca almacenar access tokens OAuth en texto plano. Usar secretos cifrados/servicio seguro.
- Los importes consolidados deben conservar original y tipo de cambio aplicado.
- commission_settings(organization_id, new_institution_bonus, bonus_currency, require_collection, tiers), opportunity_splits(opportunity_id, profile_id, share_pct) y opportunity_collections(opportunity_id, collected_on, marked_by). commissions.kind = sale | new_institution | tier.
- goals: además de owner_id, office_id y product_id, admite company_id y business_unit_id (venta/margen/unidades por la empresa de la oportunidad; instituciones y actividades por la de la institución).
- opportunities.imported_at marca ventas históricas cargadas desde Excel (`import_opportunity`): conservan su fecha real de cierre, no generan comisiones ni tareas automáticas. import_runs.entity = institutions | opportunities.
- goals.parent_id liga las metas por vendedor con la meta general de la que salieron (`split_goal`: partes iguales o montos que sumen el objetivo; volver a repartir reemplaza; borrar la general borra el reparto).
- campaign_steps(campaign_id, day_offset, activity_type, subject): secuencia de la campaña; al lanzar, una tarea por paso e institución con activities.campaign_id. Abrir una oportunidad con source_campaign_id cancela las tareas futuras de esa institución en la campaña.
- teams(name, leader_id) y team_members(team_id, profile_id único): una persona en un solo equipo. goals.team_id (excluyente con owner_id) suma lo de los miembros actuales del equipo.
