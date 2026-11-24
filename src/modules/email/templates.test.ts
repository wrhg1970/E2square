import { describe, expect, it } from "vitest";
import { fillTemplate, gmailComposeUrl, templateSchema } from "./templates";

describe("plantillas de correo", () => {
  it("llena variables y acepta sinónimos y espacios", () => {
    const r = fillTemplate("Hola {{contacto}}, {{ nombre_colegio }} y {{contacto_principal}} — {{mi_nombre}}", {
      contacto: "Ana Pérez", nombre_institucion: "Colegio Uno", mi_nombre: "Will",
    });
    expect(r.text).toBe("Hola Ana Pérez, Colegio Uno y Ana Pérez — Will");
    expect(r.missing).toEqual([]);
  });

  it("deja visibles las variables sin dato y avisa cuáles faltan", () => {
    const r = fillTemplate("En {{ciudad}} con {{cargo_contacto}} y {{otra}}", { ciudad: " ", cargo_contacto: null });
    expect(r.text).toBe("En {{ciudad}} con {{cargo_contacto}} y {{otra}}");
    expect(r.missing).toEqual(["Ciudad de la institución", "Puesto del contacto"]);
  });

  it("arma el enlace de Gmail con texto codificado", () => {
    const url = new URL(gmailComposeUrl("ana@uno.mx", "Propuesta & más", "Línea 1\nLínea 2"));
    expect(url.searchParams.get("to")).toBe("ana@uno.mx");
    expect(url.searchParams.get("su")).toBe("Propuesta & más");
    expect(url.searchParams.get("body")).toBe("Línea 1\nLínea 2");
  });

  it("valida la plantilla", () => {
    expect(templateSchema.safeParse({ category: "otra", title: "Hola", subject: "Hola", body: "Hola" }).success).toBe(false);
    expect(templateSchema.safeParse({ category: "proposal", title: " Pr ", subject: "Asunto", body: "Texto" }).success).toBe(true);
  });
});
