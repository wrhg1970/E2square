# Metas, incentivos y comisiones

## Metas
Asignables a usuario, equipo, oficina, unidad, empresa o producto. Periodos mensual, trimestral y anual. Métricas configurables: venta, margen, unidades, instituciones nuevas y actividad.

## Esquemas de comisión
- Porcentaje sobre venta neta.
- Porcentaje sobre margen.
- Importe fijo por unidad/alumno/licencia.
- Escalones por cumplimiento.
- Bono por institución nueva.
- Reparto entre colaboradores.
- Comisión condicionada a cobranza o hitos.
- Excepciones aprobadas.

## Ciclo
1. Oportunidad ganada.
2. Cálculo preliminar según plan vigente.
3. Validación de condiciones y cobranza cuando aplique.
4. Aprobación del responsable.
5. Marcado pagadero.
6. Registro de pago.
7. Conciliación/exportación.

## Controles
- Versionar planes y fechas efectivas.
- Congelar cálculo aplicado a cada operación.
- Registrar ajustes con motivo y aprobador.
- Evitar doble cálculo.
- Permitir reversión por cancelación/reembolso con trazabilidad.
- Reportar estimada, aprobada, pagadera y pagada por moneda.
- No sustituye nómina ni contabilidad.

## Reglas implementadas (propuestas el 2026-11-23, por confirmar con Will)
- Reparto: el responsable de la oportunidad (o quien administra comisiones) cede un % a otros agentes mientras no esté ganada. Cada agente cobra su % de la base con su propio porcentaje del producto; el responsable se queda con el resto.
- Bono por institución nueva: monto fijo configurable para el responsable cuando la institución gana su primera oportunidad.
- Cobranza: activada por omisión. Una comisión de venta o bono solo se marca pagada cuando quien aprueba registró en la oportunidad que el cliente pagó.
- Escalones: lista "% de meta : % extra" (p. ej. 100:1, 120:2). Al terminar una meta de venta o margen asignada a un agente, quien aprueba calcula el escalón: % extra del escalón más alto alcanzado sobre lo logrado. Queda pendiente de aprobar como cualquier comisión.
