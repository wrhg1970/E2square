# Roadmap y plan de trabajo

## Estimación
- MVP operativo: 6–9 semanas.
- Plataforma inicial completa: 16–24 semanas.
- Con 3–4 horas diarias de dirección/desarrollo asistido: planificación aproximada de 4–6 meses.
- Con 1–2 horas diarias: 7–10 meses.
- Son estimaciones; integraciones, decisiones pendientes, calidad de datos y pruebas pueden ampliar el calendario.

## Entregas
0. Descubrimiento técnico, diseño y setup.
1. Usuarios, empresas, oficinas y seguridad.
2. Instituciones y contactos.
3. Productos y oportunidades.
4. Pipelines, actividades y tareas.
5. Dashboard, metas y reportes.
6. Gmail, Calendar y campañas.
7. WhatsApp y repositorio.
8. Comisiones y automatizaciones.
9. IA, pruebas integrales y estabilización.

## Cadencia
- Plan semanal y alcance cerrado.
- Demo funcional al final de cada semana.
- Pruebas de regresión.
- Revisión de seguridad y permisos.
- Aceptación explícita antes de avanzar.
- No producción sin autorización.

## Prompt inicial para Claude Code
Lee CLAUDE.md, README.md, PRD.md, ARCHITECTURE.md y SECURITY.md completos. No modifiques archivos todavía. Inspecciona el entorno y confirma que estás en el repositorio correcto. Después presenta: (1) resumen de arquitectura, (2) riesgos y decisiones pendientes, (3) plan detallado de Fase 0, (4) comandos que ejecutarías en Windows PowerShell, (5) dependencias y costos potenciales. No instales, borres, migres, publiques ni despliegues nada hasta recibir autorización expresa.

## Prompt para cada fase
Implementa únicamente la fase [N] del BACKLOG.md. Antes de editar, enumera archivos y riesgos. Respeta CLAUDE.md, SECURITY.md y criterios del PRD. Añade pruebas. Ejecuta lint, typecheck y pruebas pertinentes. No despliegues, no hagas commit/push y no realices cambios destructivos. Al terminar informa archivos modificados, resultados reales, riesgos y preguntas pendientes. Espera aprobación.
