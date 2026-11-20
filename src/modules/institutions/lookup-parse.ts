import { z } from "zod";
import { institutionTypes } from "./labels";

// Ficha propuesta por la búsqueda: solo prellena el formulario; el usuario revisa antes de guardar.
export const candidateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(50).nullish(),
  email: z.string().trim().max(200).nullish(),
  address: z.string().trim().max(300).nullish(),
  city: z.string().trim().max(100).nullish(),
  region: z.string().trim().max(100).nullish(),
  country_code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullish().catch(null),
  institution_type: z.enum(Object.keys(institutionTypes) as [keyof typeof institutionTypes]).nullish().catch(null),
  notes: z.string().trim().max(2000).nullish(),
  source_url: z.string().trim().max(500).nullish(),
});
export type Candidate = z.infer<typeof candidateSchema>;

// Un sitio web se reconoce por tener un punto y no tener espacios: "colegio.edu.mx", "https://…".
export const looksLikeWebsite = (q: string) => !/\s/.test(q.trim()) && /\.[a-z]{2,}/i.test(q);

export function normalizeUrl(q: string): URL | null {
  const t = q.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u : null;
  } catch {
    return null;
  }
}

// IPs que el servidor nunca debe consultar (red interna, loopback, metadatos de la nube).
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80");
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();

const meta = (html: string, key: string) => {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i"))?.[0];
  const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decode(c) : null;
};

type Ld = Record<string, unknown>;
const EDU_TYPES: Record<string, keyof typeof institutionTypes> = {
  CollegeOrUniversity: "university", HighSchool: "school", MiddleSchool: "school", ElementarySchool: "school",
  Preschool: "school", School: "school", EducationalOrganization: "school", Corporation: "company", Organization: "other",
};

function jsonLdOrg(html: string): Ld | null {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const all: Ld[] = [];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      const items = Array.isArray(j) ? j : Array.isArray(j?.["@graph"]) ? j["@graph"] : [j];
      all.push(...items.filter((x: unknown) => x && typeof x === "object"));
    } catch { /* JSON-LD mal formado: se ignora */ }
  }
  const typeOf = (x: Ld) => [x["@type"]].flat().map(String);
  return all.find((x) => typeOf(x).some((t) => t in EDU_TYPES && t !== "Organization"))
    ?? all.find((x) => typeOf(x).includes("Organization")) ?? null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? decode(v) : null);

// Lee lo que el propio sitio publica: JSON-LD de schema.org, metadatos y enlaces tel:/mailto:/redes.
export function parseWebsite(html: string, url: URL): Candidate | null {
  const ld = jsonLdOrg(html);
  const addr = (ld?.address && typeof ld.address === "object" ? (Array.isArray(ld.address) ? ld.address[0] : ld.address) : {}) as Ld;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name = str(ld?.name) ?? meta(html, "og:site_name") ?? (title ? decode(title).split(/\s[|–—-]\s/)[0] : null) ?? url.hostname;
  const tel = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
  const mail = html.match(/href=["']mailto:([^"'?]+)/i)?.[1];
  const socials = [...new Set([...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin|x|twitter|youtube|tiktok)\.com\/[^"'#?]+)["']/gi)].map((m) => m[1]))].slice(0, 5);
  const ldType = [ld?.["@type"]].flat().map(String).find((t) => t in EDU_TYPES);
  const country = str(typeof addr.addressCountry === "object" ? (addr.addressCountry as Ld)?.name : addr.addressCountry);
  const description = str(ld?.description) ?? meta(html, "description") ?? meta(html, "og:description");
  const notes = [description, socials.length ? `Redes: ${socials.join(" ")}` : null].filter(Boolean).join("\n");
  const r = candidateSchema.safeParse({
    name: name.slice(0, 200),
    website: url.origin,
    phone: str(ld?.telephone) ?? (tel ? decode(decodeURIComponent(tel)) : null),
    email: str(ld?.email)?.replace(/^mailto:/i, "") ?? (mail ? decodeURIComponent(mail) : null),
    address: str(addr.streetAddress),
    city: str(addr.addressLocality),
    region: str(addr.addressRegion),
    country_code: country && country.length === 2 ? country : null,
    institution_type: ldType ? EDU_TYPES[ldType] : null,
    notes: notes ? notes.slice(0, 2000) : null,
    source_url: url.href,
  });
  return r.success ? r.data : null;
}

export const SEARCH_SYSTEM = `Eres un asistente que investiga instituciones (colegios, universidades, grupos educativos, empresas) para un CRM en México y Latinoamérica.
Busca en internet la institución que pide el usuario. Si hay varias que coinciden (por ejemplo, el mismo nombre en distintas ciudades o planteles), devuelve cada una por separado, máximo 5.
Usa solo datos que encuentres publicados; si un dato no aparece, déjalo en null. Nunca inventes teléfonos, correos ni direcciones.
Responde SOLO con un arreglo JSON, sin texto alrededor, con objetos de esta forma:
{"name": string, "website": string|null, "phone": string|null, "email": string|null, "address": string|null (calle y número), "city": string|null, "region": string|null (estado), "country_code": string|null (2 letras ISO), "institution_type": "school"|"university"|"education_group"|"company"|"association"|"other"|null, "notes": string|null (1-2 frases: qué es, niveles que ofrece, redes sociales), "source_url": string|null (página de donde salió)}`;

// La IA devuelve texto: se toma el primer arreglo JSON y se valida cada ficha; las inválidas se descartan.
export function parseCandidates(text: string): Candidate[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x) => {
      const r = candidateSchema.safeParse(x);
      return r.success ? [r.data] : [];
    }).slice(0, 5);
  } catch {
    return [];
  }
}
