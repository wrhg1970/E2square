# PRD — E2Square CRM

## 1. Visión
E2Square CRM es una plataforma de crecimiento comercial B2B para administrar relaciones institucionales y vender múltiples soluciones educativas desde una experiencia unificada.

## 2. Objetivos
- Aumentar conversión y ventas institucionales.
- Evitar oportunidades sin seguimiento.
- Ofrecer expediente 360° de cada institución.
- Dar visibilidad de pipeline, forecast, metas y margen.
- Facilitar venta cruzada entre productos y unidades.
- Reducir captura manual mediante integraciones y automatizaciones.
- Permitir operación multiempresa, multi oficina, global y multimoneda.

## 3. No objetivos iniciales
- Sustituir ERP, contabilidad, facturación o nómina.
- Procesar pagos de clientes.
- Administrar ejecución académica completa.
- Enviar campañas masivas sin controles de consentimiento.
- Calcular comisiones como obligación contable definitiva sin aprobación.

## 4. Usuarios y roles
- Superadministrador: configuración global y alta de empresas.
- Administrador de empresa: usuarios, configuración y datos de su empresa.
- Dirección general: indicadores consolidados autorizados.
- Director comercial: equipos, pipeline, metas y reportes.
- Gerente de oficina: cartera y resultados de su oficina.
- Vendedor: instituciones y oportunidades asignadas o compartidas.
- Marketing: campañas, segmentos y resultados autorizados.
- Consulta: lectura limitada.

Los permisos se basan en rol + ámbito (grupo, empresa, unidad, oficina, territorio, propietario) y excepciones explícitas.

## 5. Entidades principales
Grupo empresarial, empresa legal, unidad de negocio, oficina, usuario, equipo, territorio, institución, sucursal, contacto, relación/contacto-rol, producto, categoría, pipeline, etapa, oportunidad, línea de oportunidad, actividad, tarea, campaña, miembro de campaña, comunicación, documento, meta, comisión, tipo de cambio, automatización, consentimiento y auditoría.

## 6. Instituciones
Campos mínimos:
- Nombre legal y nombre comercial.
- Tipo y subtipo.
- País, región/estado, ciudad, dirección.
- Sitio web, teléfono, correo general.
- Identificador fiscal opcional y jurisdicción.
- Número estimado de alumnos/empleados (opcional).
- Empresa/unidad responsable.
- Oficina, territorio, propietario y equipo.
- Fuente, estado, potencial, etiquetas.
- Fecha de última interacción y próxima actividad calculadas.
- Productos actuales, potenciales y oportunidades relacionadas.

Soportar matriz/grupo educativo y sucursales/planteles. Detección de duplicados por nombre normalizado, dominio web, teléfono, identificador fiscal y dirección; sugerir coincidencias, no fusionar automáticamente.

## 7. Contactos
Una institución puede tener múltiples contactos. Un contacto puede relacionarse con más de una institución. Registrar cargo, departamento, función en decisión (decisor, influenciador, usuario, comprador, finanzas, contacto operativo), idioma, canales preferidos, consentimiento y estado. Evitar duplicar personas.

## 8. Productos
Catálogo configurable con los productos iniciales:
- IHS
- Centro de Idiomas Digital
- E-Sports
- Xplore Together
- Arukay
- Evaluaciones
- TOEFL

Cada producto admite descripción, categoría, empresa/unidad, moneda, modelos de ingreso, lista de precios/versiones, costos, materiales, segmentos objetivo, pipeline predeterminado, metas y reglas de comisión. Agregar producto no debe requerir modificar código.

## 9. Oportunidades
Una institución puede tener múltiples oportunidades simultáneas. Cada oportunidad tiene:
- Nombre, institución, contactos relacionados, producto(s), empresa/unidad.
- Pipeline y etapa.
- Propietario y colaboradores.
- Fuente/campaña.
- Volumen/cantidad, precio unitario, descuentos.
- Moneda, venta estimada, costo estimado, margen.
- Probabilidad, fecha estimada de cierre.
- Estado (abierta, ganada, perdida, cancelada).
- Motivo de pérdida, competidor, notas y próxima actividad.

Una oportunidad puede contener varias líneas de producto. Si las líneas pertenecen a diferentes entidades legales, definir reglas de oportunidad separada o asignación contractual antes de producción.

## 10. Pipeline
Motor configurable por producto/unidad. Cada pipeline tiene etapas ordenadas, probabilidad predeterminada, requisitos, SLA, colores y automatizaciones. Vistas sincronizadas: Kanban, tabla, calendario y forecast. Cambiar etapa debe registrar historial. No permitir mover a ganada sin cumplir campos requeridos configurables. Cierre perdido requiere motivo.

Regla de higiene: toda oportunidad abierta debe tener próxima actividad o una excepción justificada.

## 11. Actividades y tareas
Tipos: llamada, email, WhatsApp, visita, reunión, videollamada, presentación, propuesta, seguimiento y tarea interna. Campos: responsable, fecha/hora y zona horaria, prioridad, estado, institución, contacto, oportunidad, notas, resultado y recordatorio. Mi Día presenta pendientes, vencidas y completadas.

## 12. Campañas
Crear campañas por producto, segmento, país, tipo de institución, propietario y territorio. Registrar audiencia, consentimiento, presupuesto, costo, entregas, respuestas, reuniones, oportunidades, ventas y atribución. Detener secuencias ante respuesta, baja, rechazo o solicitud de no contacto.

## 13. Comunicaciones
Gmail: conexión OAuth por usuario o cuenta autorizada, sincronización y asociación de mensajes con contacto/institución/oportunidad. Calendar: lectura/escritura según permisos, creación de eventos y vinculación con actividades. WhatsApp Business Platform: plantillas aprobadas, opt-in, ventana de servicio, estados y webhook. No automatizar WhatsApp Web ni almacenar credenciales manualmente.

## 14. Repositorio
Documentos asociados a empresa, institución, oportunidad, producto o campaña. Metadatos, etiquetas, versiones, permisos, tamaño, tipo, autor y auditoría. Storage privado y URLs firmadas con expiración.

## 15. Dashboard y reportes
Filtros por periodo, empresa, unidad, oficina, territorio, vendedor y producto.
Indicadores: ventas ganadas, pipeline, pipeline ponderado, forecast, margen, cumplimiento de metas, conversión por etapa, win rate, ciclo de venta, oportunidades estancadas, instituciones nuevas/activas, actividad y ROI de campaña.
Mostrar fecha de actualización y definiciones de métricas.

## 16. Metas y comisiones
Metas por vendedor, oficina, unidad, producto y periodo. Métricas: ingresos, margen, unidades, instituciones nuevas y actividad.
Comisiones configurables por producto, empresa, vendedor, margen, pago cobrado, hitos y reparto. Estados: estimada, pendiente de validación, aprobada, pagadera, pagada, retenida y cancelada. Versionar reglas; no recalcular periodos cerrados silenciosamente. Registrar aprobador y evidencia.

## 17. IA — Sales Copilot
Funciones:
- Resumen 360° de institución y oportunidad.
- Preparación de reuniones.
- Sugerencia de siguiente mejor acción.
- Scoring explicable y configurable.
- Borradores de email.
- Detección de riesgo por inactividad o cambio de señales.
- Venta cruzada basada en reglas y datos autorizados.
- Preguntas en lenguaje natural sobre datos accesibles.

La IA no debe inventar hechos, cambiar etapas, precios, comisiones ni enviar comunicaciones sin autorización. Cada recomendación incluye razones y fuentes internas. Respetar permisos y evitar enviar datos sensibles a modelos externos sin base legal/configuración aprobada.

## 18. Importación Excel
Flujo: descargar plantilla → subir → mapear columnas → validar → previsualizar → resolver duplicados → importar → reporte de errores. Importación idempotente cuando sea posible. No sobrescribir registros sin confirmación. Registrar usuario, archivo, fecha y resultado.

## 19. Requisitos no funcionales
- Responsive, accesible y rápido.
- Soporte de zonas horarias y monedas.
- Auditoría de acciones críticas.
- Copias de seguridad y recuperación probada.
- Cifrado en tránsito y controles de acceso.
- Exportación autorizada y registro de descargas.
- Observabilidad de errores e integraciones.
- Arquitectura modular y APIs documentadas.

## 20. Métricas de éxito
- Porcentaje de oportunidades con próxima actividad.
- Reducción de oportunidades vencidas sin seguimiento.
- Conversión por etapa y producto.
- Tiempo desde prospecto a primer contacto.
- Exactitud del forecast.
- Uso semanal por vendedor.
- Instituciones con información completa.
- Ventas cruzadas por institución.
- Adopción de integraciones.

## 21. Criterios globales de aceptación
- Ningún usuario accede a datos fuera de su ámbito.
- Una institución admite múltiples contactos y oportunidades.
- Las vistas del pipeline reflejan los mismos datos.
- Cambios de etapa y valores quedan auditados.
- Los reportes respetan filtros y permisos.
- Importación muestra errores antes de escribir.
- Las automatizaciones son idempotentes y registran ejecución.
- Todas las integraciones pueden desconectarse sin perder el historial CRM.
