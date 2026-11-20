import { describe, expect, it } from "vitest";
import { isPrivateIp, looksLikeWebsite, normalizeUrl, parseCandidates, parseWebsite } from "./lookup-parse";

describe("búsqueda de institución", () => {
  it("distingue un sitio web de un nombre", () => {
    expect(looksLikeWebsite("colegio.edu.mx")).toBe(true);
    expect(looksLikeWebsite("https://www.uni.mx/es")).toBe(true);
    expect(looksLikeWebsite("Colegio Americano de Puebla")).toBe(false);
    expect(normalizeUrl("colegio.edu.mx")?.href).toBe("https://colegio.edu.mx/");
    expect(normalizeUrl("ftp://x.mx")).toBeNull();
  });

  it("bloquea IPs internas", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.5", "172.20.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });

  it("lee schema.org, enlaces y redes del sitio", () => {
    const html = `<html><head><title>Inicio | Colegio Sol</title><meta name="description" content="Colegio bilingüe &amp; deportivo">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},
      {"@type":"HighSchool","name":"Colegio Sol de Mayo","telephone":"+52 222 123 4567",
       "address":{"streetAddress":"Av. Juárez 10","addressLocality":"Puebla","addressRegion":"Puebla","addressCountry":"MX"}}]}</script>
      </head><body><a href="mailto:info@sol.edu.mx">Escríbenos</a><a href="https://www.facebook.com/colegiosol">FB</a></body></html>`;
    const c = parseWebsite(html, new URL("https://sol.edu.mx/inicio"));
    expect(c).toMatchObject({
      name: "Colegio Sol de Mayo", website: "https://sol.edu.mx", phone: "+52 222 123 4567", email: "info@sol.edu.mx",
      address: "Av. Juárez 10", city: "Puebla", region: "Puebla", country_code: "MX", institution_type: "school",
    });
    expect(c?.notes).toContain("Colegio bilingüe & deportivo");
    expect(c?.notes).toContain("https://www.facebook.com/colegiosol");
  });

  it("sin schema.org usa el título y tel:", () => {
    const c = parseWebsite(`<title>Universidad Norte - Bienvenidos</title><a href="tel:+5281%20555">Llámanos</a>`, new URL("https://unorte.mx"));
    expect(c).toMatchObject({ name: "Universidad Norte", phone: "+5281 555", institution_type: null });
  });

  it("toma el arreglo JSON de la IA y descarta fichas inválidas", () => {
    const text = 'Aquí está:\n[{"name":"Colegio A","city":"León","country_code":"mx","institution_type":"school"},{"name":"X"},{"name":"Colegio B","institution_type":"castillo"}]';
    const r = parseCandidates(text);
    expect(r.map((c) => c.name)).toEqual(["Colegio A", "Colegio B"]);
    expect(r[0].country_code).toBe("MX");
    expect(r[1].institution_type).toBeNull();
    expect(parseCandidates("no encontré nada")).toEqual([]);
  });
});
