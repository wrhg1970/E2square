# Backlog inicial

Prioridad: P0 imprescindible, P1 importante, P2 evolución.

## Fase 0 — Fundamentos
- P0 Crear aplicación, lint, typecheck y pruebas.
- P0 Configurar Supabase local/proyecto de desarrollo.
- P0 Variables de entorno y secretos.
- P0 Migraciones y seed.
- P0 Sistema de diseño y navegación.

## Fase 1 — Seguridad y estructura
- P0 Login/logout y recuperación.
- P0 Organización, empresas, unidades y oficinas.
- P0 Roles, permisos y ámbitos.
- P0 Auditoría básica.
- P0 Pruebas RLS de aislamiento.

## Fase 2 — Instituciones y contactos
- P0 CRUD de instituciones.
- P0 Búsqueda, filtros y vistas.
- P0 Contactos y roles de decisión.
- P0 Sucursales y grupos institucionales.
- P1 Detección de duplicados.
- P1 Importación Excel preview/commit (instituciones y, en Fase 3, oportunidades históricas).

## Fase 3 — Productos y oportunidades
- P0 Catálogo configurable.
- P0 Pipelines y etapas configurables.
- P0 Oportunidad con líneas de producto.
- P0 Cálculo venta/costo/margen.
- P0 Historial de etapas.
- P0 Cierre ganado/perdido con validaciones.
- P1 Forecast básico.

## Fase 4 — Actividades
- P0 Tareas y actividades.
- P0 Mi día.
- P0 Próxima actividad obligatoria configurable.
- P1 Recordatorios. Hecho: recordatorio opcional (a la hora, 15 min, 1 h, 1 día antes), aviso en el menú y bloque en Mi día. Sin correo ni push todavía.
- P1 Calendario interno.

## Fase 5 — Dashboard y reportes
- P0 KPIs por rol y ámbito.
- P0 Pipeline y forecast.
- P0 Metas.
- P1 Conversión por etapa/producto.
- P1 Exportación controlada.

## Fase 6 — Integraciones
- P1 Gmail OAuth y registro de mensajes.
- P1 Google Calendar.
- P1 Campañas y secuencias con controles. Hecho: campañas con audiencia por segmento (excluye inactivas y contactos que pidieron no ser contactados), lanzamiento que asigna una tarea de seguimiento por institución a su responsable, atribución de oportunidades y resultados con ROI sobre margen. Pendiente: secuencias de varios pasos y envío masivo (correo/WhatsApp), y confirmar reglas con Will.
- P1 WhatsApp Cloud API y webhooks. Hecho: recepción por webhook firmado e idempotente, estados, envío con ventana de 24 h, plantillas aprobadas, consentimiento registrado y baja por palabra clave. Falta probar con credenciales reales de Meta.
- P1 Sincronización y monitoreo. Hecho: panel "Estado de integraciones" en Administración (Google por usuario con aviso si Gmail lleva 7+ días sin sincronizar, números de WhatsApp y último aviso, envíos fallidos o sin confirmar, IA). Pendiente: sincronización automática programada.

## Fase 7 — Documentos y comisiones
- P1 Repositorio privado. Hecho: bucket privado con descarga por URL firmada de 60 s; documentos en instituciones, oportunidades, proveedores/productos y campañas; versiones (se conservan las anteriores); página "Documentos" con búsqueda por nombre y categoría que respeta permisos. Falta probar la subida real contra Supabase Storage (en local no corre Storage).
- P1 Metas avanzadas. Hecho: alcance por vendedor, oficina, proveedor, empresa y unidad de negocio; periodo mensual, trimestral o anual con un clic; ritmo esperado según días transcurridos; repetir la meta en el siguiente periodo; escalones de comisión por cumplimiento. Repartir una meta general entre vendedores (partes iguales o montos que sumen el objetivo; reglas propuestas 2026-11-23, por confirmar con Will). Pendiente: metas por equipo (no hay equipos definidos).
- P1 Planes de comisión y aprobaciones. Hecho: % por agente y producto sobre venta o margen, aprobación por director (nadie aprueba la suya), resumen mensual y CSV auditado, reparto entre agentes, bono por institución nueva, pago condicionado a cobranza y escalones por cumplimiento de meta. Reglas de los cuatro esquemas propuestas el 2026-11-23; falta que Will las confirme (ver COMMISSIONS.md).
- P1 Auditoría financiera. Hecho: filtro "Financiero" en la bitácora (oportunidades, líneas, precios, tipos de cambio, comisiones y porcentajes) y exportación CSV auditada (audit.read + reports.export, máx. 5000 filas).

## Fase 8 — Inteligencia
- P2 Sales Copilot. Base lista: IA intercambiable (Gemini o Claude por variables de entorno) y "Resumen y riesgos" por oportunidad; se activa con la clave.
- P2 Búsqueda de datos al dar de alta una institución: por sitio web funciona sin clave (lee el sitio); por nombre y con varias coincidencias usa la IA con búsqueda web.
- P2 Scoring explicable. Hecho: 7 factores por reglas (sin IA ni atributos sensibles), pesos en Administración, desglose y fecha en la ficha.
- P2 Next Best Action. Hecho (reglas): en Mi día, oportunidades con cierre vencido e instituciones sin oportunidad abierta ordenadas por puntaje.
- P2 Cross-sell. Hecho (reglas): la ficha lista productos activos que aún no se le han ofrecido a la institución, con atajo a crear la oportunidad.
- P2 Consultas analíticas en lenguaje natural.

Cada historia debe incorporar criterios de aceptación, permisos, estados UI, pruebas y documentación.
