import { describe, expect, it } from "vitest";
import { activitySchema } from "./schemas";

const base = { activity_type: "call", subject: "Llamada", due_local: "2030-01-15T10:00" };

describe("activitySchema recordatorio", () => {
  it("acepta vacío o un intervalo permitido", () => {
    expect(activitySchema.parse({ ...base, reminder: "" }).reminder).toBeNull();
    expect(activitySchema.parse({ ...base, reminder: "1440" }).reminder).toBe("1440");
  });
  it("rechaza intervalos inventados", () => {
    expect(activitySchema.safeParse({ ...base, reminder: "5" }).success).toBe(false);
  });
});

describe("activitySchema responsable", () => {
  it("vacío = yo; uuid válido = asignar", () => {
    expect(activitySchema.parse({ ...base, owner_id: "" }).owner_id).toBeNull();
    const id = "6f1c1e8e-3b2a-4c2d-9e7f-1a2b3c4d5e6f";
    expect(activitySchema.parse({ ...base, owner_id: id }).owner_id).toBe(id);
  });
  it("rechaza un responsable que no es uuid", () => {
    expect(activitySchema.safeParse({ ...base, owner_id: "ana" }).success).toBe(false);
  });
});
