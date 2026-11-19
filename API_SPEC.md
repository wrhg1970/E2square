# API e integraciones

## Convenciones
- API interna versionada `/api/v1`.
- JSON; fechas ISO 8601; importes con moneda explícita.
- Validación Zod; errores normalizados `{ code, message, details? }`.
- Paginación por cursor para listados grandes.
- Idempotency-Key para operaciones repetibles.
- Autorización server-side + RLS.

## Endpoints iniciales
- GET/POST `/api/v1/institutions`
- GET/PATCH `/api/v1/institutions/:id`
- GET/POST `/api/v1/contacts`
- GET/POST `/api/v1/products`
- GET/POST `/api/v1/pipelines`
- GET/POST `/api/v1/opportunities`
- PATCH `/api/v1/opportunities/:id/stage`
- GET/POST `/api/v1/activities`
- GET/POST `/api/v1/campaigns`
- POST `/api/v1/imports/institutions/preview`
- POST `/api/v1/imports/institutions/commit`
- GET `/api/v1/reports/pipeline`
- GET `/api/v1/reports/forecast`

## Gmail
OAuth Google; scopes mínimos según funcionalidad. Registrar metadata y fragmentos necesarios; evitar almacenar cuerpos completos salvo requerimiento aprobado. Asociar por email/contacto y permitir confirmación manual. Manejar paginación, history IDs, revocación y errores.

## Google Calendar
Crear/actualizar eventos con vínculo a actividad CRM. Respetar zona horaria, permisos del calendario, cancelaciones y sincronización. Evitar duplicados mediante IDs externos e idempotencia.

## WhatsApp Business Platform
Usar Cloud API oficial. Requiere Business Portfolio, WABA, número, app y permisos aprobados. Mensajes iniciados por empresa sujetos a plantillas y reglas vigentes; registrar opt-in, delivery/read/error y webhook firmado. Confirmar costos y requisitos vigentes con Meta antes de habilitar.

## Excel
Importar `.xlsx` y `.csv`. Primero preview/validación; nunca escribir durante preview. Reportar fila, campo, error y sugerencia. Exportación autorizada con auditoría.

## Sistemas propios
Integración mediante REST/webhooks. Crear adaptadores por sistema y contrato de datos versionado. No acoplar el dominio a un proveedor.

## IA
Gateway de IA intercambiable. Enviar contexto mínimo autorizado. Registrar modelo, uso, costo estimado y resultado; nunca guardar secretos en prompts.
