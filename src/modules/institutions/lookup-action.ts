"use server";

import { lookup } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { aiEnv } from "@/modules/ai/config";
import { generateText } from "@/modules/ai/provider";
import { type Candidate, contactLinks, isPrivateIp, looksLikeWebsite, normalizeUrl, parseCandidates, parseWebsite, SEARCH_SYSTEM } from "./lookup-parse";

export type LookupState = { candidates?: Candidate[]; error?: string; query?: string } | null;

const MAX_BYTES = 1_000_000;

// shortcut: valida la IP antes de cada salto pero no la fija para el fetch (rebinding DNS); suficiente en Vercel, que no expone red interna.
async function safeFetch(start: URL, ms = 8000): Promise<{ html: string; url: URL } | null> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!["http:", "https:"].includes(url.protocol) || (url.port && !["80", "443"].includes(url.port))) return null;
    const ips = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!ips.length || ips.some((a) => isPrivateIp(a.address))) return null;
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; CRM-lookup)", accept: "text/html" },
      signal: AbortSignal.timeout(ms),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const buf = await res.arrayBuffer();
    return { html: new TextDecoder().decode(buf.slice(0, MAX_BYTES)), url };
  }
  return null;
}

export async function lookupInstitution(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const query = String(formData.get("q") ?? "").trim().slice(0, 200);
  if (query.length < 3) return { error: "Escribe al menos 3 letras del nombre o el sitio web.", query };
  // Solo usuarios con sesión: evita que la acción sirva de proxy anónimo.
  const { data: user } = await (await createClient()).auth.getUser();
  if (!user.user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", query };

  const candidates: Candidate[] = [];
  if (looksLikeWebsite(query)) {
    const url = normalizeUrl(query);
    const home = url ? await safeFetch(url).catch(() => null) : null;
    // La dirección y el teléfono suelen estar en "Contacto" o "Ubicación": se leen también (en paralelo, máx. 3).
    const extra = home ? await Promise.all(contactLinks(home.html, home.url).map((u) => safeFetch(u, 6000).catch(() => null))) : [];
    if (home) candidates.push(...parseWebsite([home, ...extra.filter((p) => p !== null)]));
  }

  if (aiEnv()) {
    const prompt = looksLikeWebsite(query)
      ? `Investiga la institución cuyo sitio web es ${query}.${candidates[0] ? ` Su sitio dice que se llama "${candidates[0].name}".` : ""}`
      : `Investiga la institución llamada: ${query}`;
    const r = await generateText({ system: SEARCH_SYSTEM, prompt, webSearch: true });
    if ("text" in r) {
      for (const c of parseCandidates(r.text)) {
        // Lo leído directo del sitio manda; la IA completa los huecos de esa misma institución.
        const same = candidates.find((x) => x.website && c.website && new URL(normalizeUrl(c.website) ?? "https://x.invalid").hostname.replace(/^www\./, "") === new URL(x.website).hostname.replace(/^www\./, "")
          && (!x.city || !c.city || x.city === c.city));
        if (same) {
          for (const k of Object.keys(c) as (keyof Candidate)[]) if (!same[k] && c[k]) Object.assign(same, { [k]: c[k] });
        } else candidates.push(c);
      }
    } else if (!candidates.length) return { error: r.error, query };
  } else if (!looksLikeWebsite(query)) {
    return { error: "Para buscar por nombre falta configurar la IA (ver Integraciones). Mientras, escribe el sitio web de la institución.", query };
  }

  return candidates.length
    ? { candidates: candidates.slice(0, 5), query }
    : { error: "No encontramos información. Revisa el nombre o el sitio web, o captura los datos a mano.", query };
}
