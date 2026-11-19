# Arquitectura técnica

## Principios
Modular monolith primero; evitar microservicios prematuros. Separar dominio, acceso a datos, integraciones y UI. Multiempresa segura desde el esquema inicial.

## Stack
- Next.js App Router + TypeScript.
- Supabase PostgreSQL, Auth y Storage.
- Tailwind CSS + shadcn/ui.
- TanStack Table, Recharts.
- React Hook Form + Zod.
- Vitest y Playwright.
- GitHub Actions opcional para CI tras aprobación.

## Capas
1. UI: páginas, componentes y formularios.
2. Application: casos de uso y validaciones.
3. Domain: entidades, reglas y cálculos puros.
4. Infrastructure: Supabase, Google, Meta, almacenamiento, IA.
5. Jobs: procesos programados, webhooks y automatizaciones.

## Estructura sugerida
```text
src/
  app/
  components/
  modules/
    dashboard/
    institutions/
    contacts/
    products/
    opportunities/
    activities/
    campaigns/
    communications/
    documents/
    targets/
    commissions/
    copilot/
    admin/
  domain/
  application/
  infrastructure/
    supabase/
    google/
    whatsapp/
    ai/
    storage/
  lib/
  types/
supabase/
  migrations/
  seed/
tests/
```

## Multiempresa
Toda tabla de negocio debe llevar `organization_id` y, cuando aplique, `company_id`, `business_unit_id`, `office_id` y `owner_user_id`. Aplicar RLS. La organización es el límite de tenant; empresa/unidad/oficina refinan el ámbito. No confiar en filtros enviados por el cliente.

## API
Usar Route Handlers/Server Actions para operaciones internas, validar con Zod y aplicar autorización en servidor. Webhooks externos deben verificar firma, idempotencia y timestamp. Versionar APIs públicas bajo `/api/v1`.

## Integraciones
Adaptadores independientes para Gmail, Calendar, WhatsApp, Excel y sistemas propios. Guardar estado de sincronización, cursor, errores y último éxito. Reintentos con backoff y dead-letter/log de fallos.

## Moneda
Guardar importe y moneda original. Para reportes consolidados guardar tasa, fuente y fecha de conversión utilizada. No reemplazar el importe original.

## Fechas
Guardar instantes en UTC y zona horaria IANA de contexto cuando sea relevante. Mostrar en zona del usuario. Campañas y citas requieren zona horaria explícita.

## Despliegue
No desplegar sin aprobación expresa. Primero local, luego staging autorizado, finalmente producción autorizada. Mantener migraciones reversibles cuando sea viable y respaldos antes de cambios de esquema riesgosos.
