import { describe, expect, it } from "vitest";
import { contactLinks, findAddresses, isPrivateIp, looksLikeWebsite, normalizeUrl, pageLines, parseCandidates, parseWebsite, stateFromCp, typeFromName } from "./lookup-parse";

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
    const [c] = parseWebsite([{ html, url: new URL("https://sol.edu.mx/inicio") }]);
    expect(c).toMatchObject({
      name: "Colegio Sol de Mayo", website: "https://sol.edu.mx", phone: "+52 222 123 4567", email: "info@sol.edu.mx",
      address: "Av. Juárez 10", city: "Puebla", region: "Puebla", country_code: "MX", institution_type: "school",
    });
    expect(c?.notes).toContain("Colegio bilingüe & deportivo");
    expect(c?.notes).toContain("https://www.facebook.com/colegiosol");
  });

  it("sin schema.org usa el título y tel:", () => {
    const [c] = parseWebsite([{ html: `<title>Universidad Norte - Bienvenidos</title><a href="tel:+5281%20555">Llámanos</a>`, url: new URL("https://unorte.mx") }]);
    expect(c).toMatchObject({ name: "Universidad Norte", phone: "+5281 555", institution_type: "university", country_code: "MX" });
  });

  // Pie de página real de up.edu.mx (nov 2026): direcciones en texto con <br>, sin datos estructurados.
  const UP = `<html><head><title>Universidad Panamericana | Inicio</title></head><body><footer>
    <div><h4>Aguascalientes</h4><p>Av. Josemar&iacute;a Escriv&aacute; de Balaguer 101,<br>Villas de Bonaterra,<br>C.P. 20296, Aguascalientes,<br>Aguascalientes, México</p>
      <p>Conmutador: +52 449 910 6200</p></div>
    <div><h4>Ciudad de México</h4><p>Augusto Rodin No. 498,<br>Insurgentes Mixcoac,<br>C.P. 03920, Benito Juárez,<br>Ciudad de México</p>
      <p>Conmutador: +52 55 5482 1600 / 55 5482 1700</p></div>
    <div><h4>CIUDAD UP</h4><p>Autopista La Venta – Chamapa s/n,<br>Lote único.<br>Ex ejido de San Cristóbal C.P. 52796,<br>Texcalucan, Huixquilucan,<br>Estado de México</p></div>
    <div><h4>Guadalajara</h4><p>Álvaro del Portillo No. 49,<br>Ciudad Granja,<br>C.P. 45010, Zapopan,<br>Jalisco, México</p><p>Conmutador: +52 33 1368 2200</p></div>
    <p>Escríbenos a <a href="mailto:informes@up.edu.mx">informes@up.edu.mx</a></p>
  </footer></body></html>`;

  it("encuentra dirección, ciudad, estado y teléfono de cada campus en el texto", () => {
    const r = parseWebsite([{ html: UP, url: new URL("https://www.up.edu.mx/") }]);
    expect(r).toHaveLength(4);
    expect(r[0]).toMatchObject({
      name: "Universidad Panamericana", institution_type: "university", country_code: "MX", email: "informes@up.edu.mx",
      address: "Av. Josemaría Escrivá de Balaguer 101, Villas de Bonaterra, C.P. 20296", city: "Aguascalientes", region: "Aguascalientes", phone: "+52 449 910 6200",
    });
    expect(r[1]).toMatchObject({ address: "Augusto Rodin No. 498, Insurgentes Mixcoac, C.P. 03920, Benito Juárez", city: "Ciudad de México", region: "Ciudad de México", phone: "+52 55 5482 1600" });
    expect(r[2]).toMatchObject({ city: "Huixquilucan", region: "Estado de México" });
    expect(r[2].address).toContain("Autopista La Venta");
    expect(r[3]).toMatchObject({ address: "Álvaro del Portillo No. 49, Ciudad Granja, C.P. 45010", city: "Zapopan", region: "Jalisco" });
  });

  it("dirección con municipio antes del C.P. (anahuac.mx)", () => {
    const [a] = findAddresses(pageLines(`<p>CAMPUS NORTE</p><p>Av. Universidad Anáhuac 46<br>Col. Lomas Anáhuac<br>Huixquilucan, Estado de México<br>C.P. 52786.</p><p>Conmutador: +52 (55) 5627 0210</p>`));
    expect(a).toMatchObject({ address: "Av. Universidad Anáhuac 46, Col. Lomas Anáhuac, C.P. 52786", city: "Huixquilucan", region: "Estado de México", phone: "+52 (55) 5627 0210" });
  });

  it("dirección partida en renglones con número aparte (Santa Fe)", () => {
    const [a] = findAddresses(pageLines(`<p>Santa Fe</p><p>Park Plaza II piso 3.<br>Av. Javier Barros Sierra,<br>No. 540. Piso 3. Col. Santa Fe,<br>C.P. 01210, Alcaldía Álvaro Obregón.</p>`));
    expect(a).toMatchObject({ address: "Av. Javier Barros Sierra, No. 540. Piso 3. Col. Santa Fe, C.P. 01210, Alcaldía Álvaro Obregón", city: "Ciudad de México", region: "Ciudad de México" });
  });

  it("estado por código postal, tipo por nombre y enlaces de contacto", () => {
    expect(stateFromCp("03920")).toBe("Ciudad de México");
    expect(stateFromCp("72810")).toBe("Puebla");
    expect(stateFromCp("97000")).toBe("Yucatán");
    expect(typeFromName("Colegio Americano")).toBe("school");
    expect(typeFromName("Grupo Educativo Sol")).toBe("education_group");
    const links = contactLinks(`<a href="/contacto">Contáctanos</a><a href="https://www.up.edu.mx/nuestros-campus/">Campus</a><a href="https://otro.com/contacto">x</a><a href="/blog">Blog</a>`, new URL("https://up.edu.mx/"));
    expect(links.map((u) => u.href)).toEqual(["https://up.edu.mx/contacto", "https://www.up.edu.mx/nuestros-campus/"]);
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
