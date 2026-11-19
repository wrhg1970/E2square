# E2Square CRM — Institutional Growth Platform

Paquete inicial de producto y desarrollo para construir un CRM B2B multiempresa, multiproducto y global.

## Objetivo
Centralizar la gestión comercial de instituciones, contactos, oportunidades, actividades, campañas, comunicaciones, documentos, metas, comisiones e inteligencia comercial.

## Decisiones confirmadas
- Usuarios: toda la organización; 20–30 usuarios iniciales.
- Clientes: colegios, universidades, grupos educativos, empresas, asociaciones y otras organizaciones.
- Estructura: empresa principal con capacidad de incorporar otras empresas.
- Asignación: combinación de vendedor, oficina y territorio.
- Productos iniciales: IHS, Centro de Idiomas Digital, E-Sports, Xplore Together, Arukay, Evaluaciones y TOEFL.
- Una institución puede tener múltiples contactos y oportunidades simultáneas.
- Pipeline configurable por producto.
- Venta: directa, comisión, licencia/suscripción y combinaciones.
- Oportunidades: monto, volumen, precio, moneda, costo, margen, probabilidad y fecha de cierre.
- Metas e incentivos: sí; comisiones configurables y sujetas a aprobación/pago.
- Integraciones: Google Workspace/Gmail, Google Calendar, WhatsApp Business, Excel y sistemas propios.
- Alcance: global, multimoneda y multiidioma.
- Roles: administrador, dirección general, director comercial, gerente de oficina, vendedor, marketing y consulta.
- Importación Excel con detección de duplicados.
- UX: minimalista, moderna y ejecutiva.
- Marca: E2Square.
- Desarrollo: Windows + Claude Code + GitHub privado; no usar VS Code; no desplegar ni realizar cambios destructivos sin autorización expresa.

## Cómo usar este paquete
1. Crear un repositorio privado llamado `e2square-crm`.
2. Copiar todos los archivos de este paquete a la raíz del repositorio.
3. Abrir Claude Code desde la carpeta del repositorio.
4. Leer `CLAUDE.md`.
5. Ejecutar el prompt de inicio incluido al final de `ROADMAP.md`.
6. Trabajar por entregas; no avanzar sin pruebas y aceptación de la fase anterior.

## Estado
Este paquete es una base funcional y técnica inicial. Las reglas comerciales específicas, tarifas, territorios, comisiones y pipelines deberán parametrizarse con datos reales antes de producción.
