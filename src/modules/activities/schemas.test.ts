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
