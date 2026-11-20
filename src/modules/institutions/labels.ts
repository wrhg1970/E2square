// Etiquetas en español de los valores guardados en la base.
export const institutionTypes = {
  school: "Colegio",
  university: "Universidad",
  education_group: "Grupo educativo",
  company: "Empresa",
  association: "Asociación",
  individual: "Particular / alumno",
  other: "Otra",
} as const;

export const institutionStatuses = {
  prospect: "Prospecto",
  active_client: "Cliente",
  former_client: "Excliente",
  inactive: "Inactiva",
} as const;

export const potentials = { high: "Alto", medium: "Medio", low: "Bajo" } as const;

export const decisionRoles = {
  decision_maker: "Decisor",
  influencer: "Influenciador",
  user: "Usuario",
  buyer: "Comprador",
  finance: "Finanzas",
  operational: "Contacto operativo",
} as const;

export const toOptions = (labels: Record<string, string>, empty?: string) => [
  ...(empty === undefined ? [] : [{ value: "", label: empty }]),
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
];

// Minúsculas, sin acentos ni signos: para comparar encabezados y valores escritos a mano.
export const normalizeText = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Acepta la clave interna o la etiqueta en español ("Grupo educativo" -> education_group).
export function fromLabel<T extends Record<string, string>>(labels: T, value: string): keyof T | undefined {
  const n = normalizeText(value);
  return (Object.keys(labels) as (keyof T)[]).find((k) => normalizeText(String(k)) === n || normalizeText(labels[k]) === n);
}
