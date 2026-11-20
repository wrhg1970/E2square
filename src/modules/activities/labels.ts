export const activityTypes = {
  call: "Llamada",
  email: "Correo",
  whatsapp: "WhatsApp",
  visit: "Visita",
  meeting: "Reunión",
  video_call: "Videollamada",
  presentation: "Presentación",
  proposal: "Propuesta",
  follow_up: "Seguimiento",
  internal_task: "Tarea interna",
} as const;

export const priorities = { high: "Alta", normal: "Normal", low: "Baja" } as const;
