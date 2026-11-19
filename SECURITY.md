# Seguridad y privacidad

## Controles
- Supabase RLS en todas las tablas multi-tenant.
- Autorización de servidor en cada operación sensible.
- MFA recomendado para administradores.
- OAuth con scopes mínimos.
- Tokens externos cifrados y rotables.
- Storage privado; URLs firmadas temporales.
- Validación de archivos, límites de tamaño y tipos MIME.
- Rate limiting en login, APIs y webhooks.
- Protección CSRF/XSS/SQL injection mediante prácticas del framework y consultas parametrizadas.
- Auditoría de cambios, exportaciones, permisos y comisiones.
- Backups y procedimiento de restauración probado.
- Secretos fuera de Git; `.env.local` ignorado.

## Datos personales
Definir aviso de privacidad, finalidad, base legal/consentimiento, retención, acceso, rectificación y eliminación conforme a las jurisdicciones aplicables. Registrar consentimiento y bajas de comunicaciones.

## Integraciones
- Google OAuth: scopes mínimos y revocación.
- WhatsApp: verificar firmas de webhooks y políticas de plantillas/ventanas.
- Sistemas propios: credenciales por entorno, allowlist si aplica, idempotencia y logs sin datos sensibles.
- IA: enviar solo datos necesarios; respetar permisos del usuario; no usar datos de una empresa en contexto de otra.

## Incidentes
Documentar responsable, clasificación, contención, rotación de credenciales, análisis, notificación aplicable y recuperación.

## Pruebas obligatorias
Probar acceso cruzado entre organizaciones, empresas, oficinas y roles. Probar URLs de documentos con usuarios no autorizados. Probar que exportaciones respetan filtros y ámbito.
