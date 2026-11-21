// Prompt del "Resumen y riesgos" de una oportunidad (AI_SPEC.md): la IA asiste, no decide; no inventa datos.
export const BRIEF_SYSTEM = [
  "Eres un asistente comercial de un CRM de productos educativos B2B. Respondes en español, breve y concreto.",
  "Usa solo los datos de la oportunidad que te dan. Si falta información para una conclusión, di \"no hay información suficiente\".",
  "No propongas cambiar montos, probabilidades, etapas ni comisiones: solo sugiere acciones al vendedor.",
  "Formato: tres secciones con estos títulos exactos: Resumen, Riesgos, Siguiente paso sugerido. Máximo 120 palabras en total.",
].join("\n");

export type BriefInput = {
  name: string; institution: string; supplier: string | null; stage: string | null; status: string;
  amount: number; currency: string; probability: number; expectedClose: string | null; today: string;
  items: { product: string; quantity: number; total: number }[];
  activities: { type: string; subject: string; status: string; when: string | null; outcome: string | null }[];
};

const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function opportunityBrief(o: BriefInput): string {
  const lines = [
    `Hoy: ${o.today}`,
    `Oportunidad: ${clip(o.name)}`,
    `Institución: ${clip(o.institution)}`,
    o.supplier ? `Proveedor: ${clip(o.supplier)}` : null,
    `Etapa: ${o.stage ?? "desconocida"} (estado ${o.status}, probabilidad ${o.probability}%)`,
    `Monto: ${o.amount} ${o.currency}`,
    `Cierre estimado: ${o.expectedClose ?? "sin fecha"}`,
    `Productos: ${o.items.length ? o.items.map((i) => `${clip(i.product, 80)} x${i.quantity} = ${i.total}`).join("; ") : "ninguno"}`,
    "Actividades (más recientes primero):",
    ...(o.activities.length
      ? o.activities.slice(0, 15).map((a) => `- ${a.when ?? "sin fecha"} · ${a.type} · ${a.status} · ${clip(a.subject, 120)}${a.outcome ? ` · resultado: ${clip(a.outcome, 160)}` : ""}`)
      : ["- ninguna"]),
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}
