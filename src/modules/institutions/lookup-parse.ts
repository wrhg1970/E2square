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
  contact_first_name: z.string().trim().max(100).nullish(),
  contact_last_name: z.string().trim().max(100).nullish(),
  contact_job_title: z.string().trim().max(150).nullish(),
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

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ordm: "º", ordf: "ª", deg: "°", ndash: "–", mdash: "—" };
const decodeKeep = (s: string) =>
  s.replace(/&([aeiouyAEIOUY])acute;/g, (_, l) => `${l}́`.normalize())
    .replace(/&([nN])tilde;/g, (_, l) => (l === "n" ? "ñ" : "Ñ")).replace(/&([uU])uml;/g, (_, l) => (l === "u" ? "ü" : "Ü"))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const decode = (s: string) => decodeKeep(s).replace(/\s+/g, " ").trim();

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

function jsonLdItems(html: string): Ld[] {
  const all: Ld[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const items = Array.isArray(j) ? j : Array.isArray(j?.["@graph"]) ? j["@graph"] : [j];
      all.push(...items.filter((x: unknown) => x && typeof x === "object"));
    } catch { /* JSON-LD mal formado: se ignora */ }
  }
  return all;
}
const typeOf = (x: Ld) => [x["@type"]].flat().map(String);
const jsonLdOrg = (all: Ld[]) =>
  all.find((x) => typeOf(x).some((t) => t in EDU_TYPES && t !== "Organization")) ?? all.find((x) => typeOf(x).includes("Organization")) ?? null;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? decode(v) : null);

// Texto visible por renglones: cada <br> o bloque (p, div, li…) es un renglón, como lo ve la persona.
export function pageLines(html: string): string[] {
  return html
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/?(?:p|div|li|ul|ol|h[1-6]|tr|td|th|section|footer|header|address|article|aside|nav)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((l) => decode(l).replace(/^[,;\s]+|[,;\s]+$/g, ""))
    .filter(Boolean);
}

// Primeros dos dígitos del código postal mexicano → estado (rangos de Correos de México).
const CP_STATES: [number, string][] = [
  [16, "Ciudad de México"], [19, ""], [20, "Aguascalientes"], [22, "Baja California"], [23, "Baja California Sur"], [24, "Campeche"],
  [27, "Coahuila"], [28, "Colima"], [30, "Chiapas"], [33, "Chihuahua"], [35, "Durango"], [38, "Guanajuato"], [41, "Guerrero"],
  [43, "Hidalgo"], [49, "Jalisco"], [57, "Estado de México"], [61, "Michoacán"], [62, "Morelos"], [63, "Nayarit"], [67, "Nuevo León"],
  [71, "Oaxaca"], [75, "Puebla"], [76, "Querétaro"], [77, "Quintana Roo"], [79, "San Luis Potosí"], [82, "Sinaloa"], [85, "Sonora"],
  [86, "Tabasco"], [89, "Tamaulipas"], [90, "Tlaxcala"], [96, "Veracruz"], [97, "Yucatán"], [99, "Zacatecas"],
];
export const stateFromCp = (cp: string) => CP_STATES.find(([max]) => Number(cp.slice(0, 2)) <= max)?.[1] || null;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const CP_RE = /\b(?:C\.?\s?P\.?|c[oó]digo postal)\s*:?\s*(\d{5})\b/i;
const STREET_RE = /^(?:av(?:enida)?\.?|calle|blvd\.?|boulevard|bulevar|calz(?:ada)?\.?|carr(?:etera)?\.?|autopista|prol(?:ongaci[oó]n)?\.?|camino|circuito|perif[eé]rico|paseo|privada|km\.?)\s/i;
const STOP_RE = /:|@|campus\b|plantel\b|^(?:tel|conmutador|whats)|\+?\d[\d ()-]{9,}\d|\b\d{5}\b/i;

export type FoundAddress = { address: string; city: string | null; region: string | null; postal: string; phone: string | null };

// Direcciones en texto: se ancla en el "C.P. 12345" y toma los renglones de alrededor (calle, colonia, municipio, estado).
export function findAddresses(lines: string[]): FoundAddress[] {
  const out: FoundAddress[] = [];
  lines.forEach((line, i) => {
    const cp = line.match(CP_RE)?.[1];
    if (!cp || line.length > 250) return;
    const region = stateFromCp(cp);
    const isPlace = (x: string) => {
      const n = norm(x);
      return n === "mexico" || n === norm(region ?? "-") || n === "cdmx" || n === "edo de mexico" || n === "estado de mexico";
    };
    const parts = [line];
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const l = lines[j];
      if (l.length > 100 || STOP_RE.test(l) || (l === l.toUpperCase() && /[A-Z]{3}/.test(l))) break;
      parts.unshift(l);
      // Llegamos a la calle: empieza con Av./Calle… o trae número (y no es solo "No. 540", "Piso 3", "Col. …").
      if (STREET_RE.test(l) || (/\d|s\/n/i.test(l) && !/^(?:no\.?|n[uú]m|piso|int|col)/i.test(l))) break;
    }
    for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
      const l = lines[j];
      if (l.length > 50 || /\d|:|@/.test(l) || (l === l.toUpperCase() && /[A-Z]{3}/.test(l))) break;
      parts.push(l);
      if (isPlace(l.split(",").pop() ?? "")) break; // el estado o el país cierran la dirección
    }
    const segs = parts.join(", ").split(/\s*,\s*/).map((x) => x.replace(/\.$/, "").trim()).filter(Boolean);
    const cpAt = segs.findIndex((x) => CP_RE.test(x));
    const pick = (xs: string[]) => [...xs].reverse().find((x) => !isPlace(x) && !/\d|^col(?:onia)?\.?\s|^alcald[ií]a|^ex /i.test(x)) ?? null;
    const after = segs.slice(cpAt + 1);
    // "C.P. 20296, Aguascalientes, Aguascalientes": la ciudad se llama como el estado.
    const city = region === "Ciudad de México" ? region
      : pick(after) ?? (after.some((x) => norm(x) === norm(region ?? "-")) ? region : pick(segs.slice(1, cpAt)));
    const keep = (xs: string[]) => xs.filter((x) => !isPlace(x) && x !== city).map((x) => x.replace(CP_RE, "").replace(/^[\s,.-]+|[\s,.-]+$/g, "")).filter(Boolean);
    const phoneLine = lines.slice(i + 1, i + 7).find((l) => PHONE_RE.test(l) && !CP_RE.test(l));
    out.push({
      address: [...keep(segs.slice(0, cpAt + 1)), `C.P. ${cp}`, ...keep(after)].join(", ").slice(0, 300),
      city: city?.slice(0, 100) ?? null,
      region,
      postal: cp,
      phone: phoneLine ? phoneIn(phoneLine) : null,
    });
  });
  return out.filter((a, k) => out.findIndex((b) => b.postal === a.postal && b.address === a.address) === k);
}

const PHONE_RE = /(?:tel[ée]fonos?|tel\.?|conmutador|ll[aá]manos|whatsapp|informes)\s*:?\s*(\+?\d[\d\s().-]{7,22}\d)/i;
const phoneIn = (line: string) => {
  const p = line.match(PHONE_RE)?.[1];
  return p && p.replace(/\D/g, "").length >= 10 ? p.replace(/\s+/g, " ").trim() : null;
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
function bestEmail(emails: string[], host: string): string | null {
  const base = host.replace(/^www\./, "");
  const ok = [...new Set(emails.map((e) => e.toLowerCase()))].filter((e) => !/\.(png|jpe?g|gif|svg|webp)$|example\.|sentry|wixpress/.test(e));
  const score = (e: string) => (e.endsWith(base) || base.endsWith(e.split("@")[1]) ? 2 : 0) + (/^(info|informes|contacto|admisiones|hola)/.test(e) ? 1 : 0);
  return ok.sort((a, b) => score(b) - score(a))[0] ?? null;
}

// Tipo por el nombre cuando el sitio no lo declara.
export function typeFromName(name: string): keyof typeof institutionTypes | null {
  if (/universi|polit[eé]cnic|tecnol[oó]gico de/i.test(name)) return "university";
  if (/^grupo\b/i.test(name)) return "education_group";
  if (/colegio|escuela|preparatoria|kinder|jard[ií]n de niños|primaria|secundaria|school|liceo|academia|instituto|college/i.test(name)) return "school";
  return null;
}

// Enlaces a páginas de contacto o ubicación del mismo sitio, donde suelen estar dirección y teléfono.
export function contactLinks(html: string, base: URL): URL[] {
  const host = base.hostname.replace(/^www\./, "");
  const out: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/contact|ubicaci|campus|plantel|sedes|d[oó]nde estamos|directorio/i.test(`${m[1]} ${m[2].replace(/<[^>]+>/g, "")}`)) continue;
    try {
      const u = new URL(decode(m[1]), base);
      u.hash = "";
      if (u.hostname.replace(/^www\./, "") === host && u.href !== base.href && !out.some((x) => x.href === u.href)) out.push(u);
    } catch { /* enlace inválido */ }
  }
  return out.slice(0, 3);
}

// Lee lo que el propio sitio publica (portada y páginas de contacto): JSON-LD de schema.org, metadatos,
// enlaces tel:/mailto:, y en el texto visible direcciones con C.P., teléfonos y correos.
// Si encuentra varias direcciones (planteles), devuelve una ficha por cada una.
export function parseWebsite(pages: { html: string; url: URL }[]): Candidate[] {
  if (!pages.length) return [];
  const [home] = pages;
  const all = pages.flatMap((p) => jsonLdItems(p.html));
  const ld = jsonLdOrg(all);
  const ldAddr = [ld, ...all].map((x) => x?.address).find((a) => a && typeof a === "object");
  const addr = (Array.isArray(ldAddr) ? ldAddr[0] : ldAddr ?? {}) as Ld;
  const title = home.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name = (str(ld?.name) ?? meta(home.html, "og:site_name") ?? (title ? decode(title).split(/\s[|–—-]\s/)[0] : null) ?? home.url.hostname).slice(0, 200);
  const html = pages.map((p) => p.html).join("\n");
  const lines = pages.flatMap((p) => pageLines(p.html));
  const tel = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
  const mails = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const socials = [...new Set([...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin|x|twitter|youtube|tiktok)\.com\/[^"'#?]+)["']/gi)].map((m) => m[1]))].slice(0, 5);
  const ldType = [ld?.["@type"]].flat().map(String).find((t) => t in EDU_TYPES);
  const country = str(typeof addr.addressCountry === "object" ? (addr.addressCountry as Ld)?.name : addr.addressCountry);
  const description = str(ld?.description) ?? meta(home.html, "description") ?? meta(home.html, "og:description");
  const notes = [description, socials.length ? `Redes: ${socials.join(" ")}` : null].filter(Boolean).join("\n");
  const textPhone = lines.map(phoneIn).find(Boolean) ?? null;
  const ldStreet = [str(addr.streetAddress), str(addr.postalCode) ? `C.P. ${str(addr.postalCode)}` : null].filter(Boolean).join(", ");

  const base = {
    name,
    website: home.url.origin,
    phone: str(ld?.telephone) ?? (tel ? decode(decodeURIComponent(tel)) : null) ?? textPhone,
    email: str(ld?.email)?.replace(/^mailto:/i, "") ?? bestEmail([...mails, ...lines.join(" ").matchAll(EMAIL_RE)].map(String), home.url.hostname),
    address: ldStreet || null,
    city: str(addr.addressLocality),
    region: str(addr.addressRegion),
    country_code: country && country.length === 2 ? country : country && /m[eé]xico/i.test(country) ? "MX" : null,
    institution_type: ldType ? EDU_TYPES[ldType] : typeFromName(name),
    notes: notes ? notes.slice(0, 2000) : null,
    source_url: home.url.href,
  };
  const found = base.address ? [] : findAddresses(lines);
  const variants = found.length
    ? found.slice(0, 5).map((a) => ({ ...base, address: a.address, city: a.city, region: a.region, country_code: "MX", phone: a.phone ?? base.phone }))
    : [{ ...base, country_code: base.country_code ?? (home.url.hostname.endsWith(".mx") ? "MX" : null) }];
  return variants.flatMap((v) => {
    const r = candidateSchema.safeParse(v);
    return r.success ? [r.data] : [];
  });
}

export const SEARCH_SYSTEM = `Eres un asistente que investiga instituciones (colegios, universidades, grupos educativos, empresas) para un CRM en México y Latinoamérica.
Busca en internet la institución que pide el usuario. Si hay varias que coinciden (por ejemplo, el mismo nombre en distintas ciudades o planteles), devuelve cada una por separado, máximo 5. Revisa también la página de contacto o ubicación del sitio oficial para obtener dirección, teléfono y correo.
Usa solo datos que encuentres publicados; si un dato no aparece, déjalo en null. Nunca inventes teléfonos, correos ni direcciones.
Responde SOLO con un arreglo JSON, sin texto alrededor, con objetos de esta forma:
{"name": string, "website": string|null, "phone": string|null, "email": string|null, "address": string|null (calle, número, colonia y C.P.), "city": string|null, "region": string|null (estado), "country_code": string|null (2 letras ISO), "institution_type": "school"|"university"|"education_group"|"company"|"association"|"other"|null, "notes": string|null (1-2 frases: qué es, niveles que ofrece, redes sociales), "contact_first_name": string|null, "contact_last_name": string|null, "contact_job_title": string|null (director, rector o responsable de admisiones si su nombre está publicado), "source_url": string|null (página de donde salió)}`;

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
