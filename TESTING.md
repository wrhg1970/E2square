# Estrategia de pruebas

## Pirámide
- Unitarias: cálculos, validaciones, scoring, reglas de etapa, comisiones.
- Integración: repositorios, políticas RLS, transacciones, webhooks y sincronización.
- E2E: login, creación de institución, contacto, oportunidad, actividad, cierre y reportes.
- Seguridad: aislamiento multiempresa, escalamiento de privilegios, documentos, exportación.
- Usabilidad: tareas comunes y responsive.
- Rendimiento: listados, búsqueda, dashboard y consultas de pipeline.

## Casos críticos
1. Usuario de empresa A no ve ni modifica empresa B.
2. Vendedor no puede acceder a cartera no asignada salvo permiso.
3. Institución admite varios contactos y oportunidades.
4. Cambiar etapa registra historial y valida requisitos.
5. Oportunidad ganada calcula venta y margen con moneda correcta.
6. Cambio futuro de precio no altera líneas históricas.
7. Importación preview no escribe datos.
8. Reintento de webhook no duplica mensajes/actividades.
9. Baja de marketing detiene secuencias.
10. Comisión conserva versión de regla y aprobaciones.
11. Documento privado no es accesible por URL sin permiso.
12. Reportes respetan filtros y ámbitos.
