# Automatizaciones comerciales

## Motor
Evento → condiciones → acciones. Debe soportar habilitar/deshabilitar, prioridad, idempotencia, historial, reintentos y límites para evitar bucles.

## Reglas sugeridas
1. Oportunidad creada: crear tarea de primer contacto si no existe.
2. Propuesta enviada: crear seguimiento configurable.
3. Oportunidad abierta sin próxima actividad: alertar propietario.
4. Oportunidad sin interacción N días: marcar riesgo y notificar gerente según reglas.
5. Tarea vencida: notificar responsable y escalar tras umbral.
6. Cambio a ganada: iniciar checklist de handoff; no generar factura automáticamente.
7. Cambio a perdida: exigir motivo y registrar competidor opcional.
8. Campaña lanzada: crear actividades asignadas según distribución.
9. Respuesta a secuencia: detener mensajes automáticos pendientes.
10. Meta en riesgo: alertar responsable con explicación.
11. Cambio de propietario: notificar anterior/nuevo responsable y registrar auditoría.
12. Renovación/fecha anual: crear tarea anticipada configurable.

## Controles
- Consentimiento y preferencias de contacto.
- Ventanas horarias y zona horaria.
- Límites por canal.
- Aprobación humana para mensajes externos en MVP.
- Simulación/preview antes de activar reglas.
