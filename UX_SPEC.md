# UX/UI Specification

## Dirección visual
E2Square: minimalista, moderna, ejecutiva. Alta densidad de información sin saturación. Diseño responsive, accesible y consistente. No asumir colores o tipografía oficiales: extraer guía de marca y activos aprobados de E2Square antes de cerrar tokens visuales.

## Navegación
- Inicio
- Instituciones
- Contactos
- Oportunidades
- Productos
- Campañas
- Actividades / Mi día
- Comunicaciones
- Repositorio
- Reportes
- Metas y comisiones
- Sales Copilot
- Administración

## Pantallas principales
1. Dashboard por rol.
2. Mi día.
3. Listado de instituciones con filtros, vistas guardadas y carga Excel.
4. Expediente institucional 360° con timeline.
5. Contacto y mapa de decisores.
6. Pipeline Kanban, tabla, calendario y forecast.
7. Detalle de oportunidad con líneas de producto, margen, historial y tareas.
8. Catálogo de productos y listas de precio.
9. Campañas y audiencia.
10. Bandeja de actividad/comunicaciones.
11. Repositorio con búsqueda y permisos.
12. Metas, forecast y comisiones.
13. Administración de empresas, unidades, oficinas, roles y pipelines.

## Reglas UX
- Acciones frecuentes en máximo 1–2 interacciones cuando sea posible.
- Captura rápida de llamada/reunión.
- Búsqueda global.
- Filtros persistentes y vistas guardadas.
- Estados loading, empty, error y success.
- Confirmación para acciones destructivas o cambios financieros.
- No depender solo del color para indicar estado.
- Formularios progresivos: mostrar campos avanzados solo cuando correspondan.
- Mobile: priorizar Mi día, búsqueda, institución, oportunidad y actividad.

## Patrones de pantalla (2026-11-24)
Lineamientos aprobados por Will al rediseñar las pantallas, con su componente en `src/components/ui/`:
- Cifras resumen arriba, dentro de la banda azul noche: `StatTile`.
- Estatus, etapas y categorías como etiquetas de color con texto (no solo color): `Pill`.
- Filtros de un clic, sin botón "Filtrar": `Segmented` (enlaces) y `AutoForm` (listas al cambiar, fechas al salir del campo, texto con Enter). Botones rápidos de periodo donde haya fechas.
- Formularios de alta cerrados detrás de un botón, a todo el ancho y en bloques con título: `Reveal` + `FormBlock`.
- Listas repetidas como tabla compacta; la fila se toca para ver detalle o editar (`<details>` por fila, como Metas y Automatizaciones).
- Estados vacíos que explican qué hacer y ofrecen el botón para hacerlo: `EmptyState`. Los bloques vacíos de un tablero no se muestran.
- Listas largas (personas, productos) con buscador en vez de desplegable: `ComboField` (el servidor sigue validando el id).
- Pantallas con muchas secciones (Administración) se parten en pestañas para que lo buscado quede arriba sin desplazarse.
