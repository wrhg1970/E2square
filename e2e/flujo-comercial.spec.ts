import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_USER } from "./global-setup";

// Flujo crítico del piloto: login → institución → oportunidad → productos → actividad → ganada → dashboard → exportación.
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const institution = `Colegio E2E ${stamp}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(E2E_USER.email);
  await page.getByLabel("Contraseña").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
});

test("sin sesión redirige al login y rechaza contraseña incorrecta", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/oportunidades");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Correo").fill(E2E_USER.email);
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.close();
});

// Lee "N ganadas" del indicador de venta (la base puede traer corridas anteriores).
async function wonCount(page: import("@playwright/test").Page) {
  await page.goto("/");
  const text = await page.getByText("Venta ganada", { exact: true }).locator("..").innerText();
  return Number(/(\d+) ganadas/.exec(text)?.[1] ?? NaN);
}

test("define el porcentaje de comisión del agente", async ({ page }) => {
  await page.goto("/comisiones");
  await page.getByLabel("Agente").selectOption({ label: E2E_USER.email });
  await page.getByLabel("Producto").selectOption({ label: "IHS" });
  await page.getByLabel("Porcentaje").fill("10");
  await page.getByLabel("Calcular sobre").selectOption({ label: "Margen" });
  await page.getByRole("button", { name: "Guardar porcentaje" }).click();
  await expect(page.getByText("Porcentaje guardado.")).toBeVisible();
});

test("vende de punta a punta y lo ve en el dashboard", async ({ page }) => {
  const wonBefore = await wonCount(page);
  await page.goto("/instituciones/nueva");
  await page.getByLabel("Nombre de la institución").fill(institution);
  await page.getByLabel("Tipo", { exact: true }).selectOption({ label: "Colegio" });
  await page.getByLabel("Ciudad").fill("Puebla");
  await page.getByLabel("Nombre", { exact: true }).fill("Ana");
  await page.getByLabel("Apellidos").fill("Pérez");
  await page.getByLabel("Correo", { exact: true }).fill(`ana.${stamp}@colegio-e2e.mx`);
  await page.getByRole("button", { name: "Crear institución" }).click();
  // Si la base ya trae corridas anteriores, el detector de duplicados avisa: se confirma a propósito.
  const dup = page.getByText("Puede que esta institución ya exista");
  await expect(page.getByRole("heading", { name: institution }).or(dup)).toBeVisible();
  if (await dup.isVisible()) {
    await page.getByLabel("Crear aunque parezca duplicada").check();
    await page.getByRole("button", { name: "Crear institución" }).click();
  }
  await expect(page.getByRole("heading", { name: institution })).toBeVisible();
  await expect(page.getByText("Ana Pérez").first()).toBeVisible();

  const instUrl = page.url();
  await page.goto(`/oportunidades/nueva?institucion=${instUrl.split("/").pop()}`);
  await page.getByLabel("Producto (pipeline)").selectOption({ label: "IHS" });
  await page.getByLabel("Nombre", { exact: true }).fill(`IHS ${stamp}`);
  await page.getByLabel("Moneda").selectOption("USD");
  await page.getByLabel("Cierre estimado").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Crear oportunidad" }).click();
  await expect(page.getByRole("heading", { name: `IHS ${stamp}` })).toBeVisible();

  await page.getByText(/Agregar producto/).click();
  await page.getByLabel("Producto", { exact: true }).selectOption({ label: "IHS" });
  await page.getByLabel("Cantidad").fill("10");
  await page.getByLabel("Precio unitario").fill("100");
  await page.getByLabel("Costo unitario").fill("40");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText(/1,000/).first()).toBeVisible();

  await page.getByLabel("Asunto").fill("Presentación a dirección");
  await page.getByLabel("Fecha y hora").fill("2030-01-15T10:00");
  await page.getByRole("button", { name: "Guardar actividad" }).click();
  await expect(page.getByText("Presentación a dirección")).toBeVisible();

  await page.getByLabel("Etapa").first().selectOption({ label: "Ganada" });
  await page.getByRole("button", { name: "Mover" }).first().click();
  await expect(page.getByText("Ganada").first()).toBeVisible();

  expect(await wonCount(page)).toBe(wonBefore + 1);
  await expect(page.getByText(/Conversión por etapa/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Exportar oportunidades/ }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv).toContain(institution);
  expect(csv).toContain("Ganada");
});

test("la venta ganada genera su comisión pendiente", async ({ page }) => {
  await page.goto("/comisiones");
  const row = page.getByRole("row").filter({ hasText: `IHS ${stamp}` });
  await expect(row).toContainText("Margen: USD 600"); // venta 1,000 - costo 400
  await expect(row.getByRole("cell", { name: "USD 60", exact: true })).toBeVisible(); // 10% del margen
  await expect(row.getByRole("button", { name: "Aprobar" })).toHaveCount(0); // nadie aprueba la suya
});

test("avisa antes de crear una institución duplicada", async ({ page }) => {
  await page.goto("/instituciones/nueva");
  await page.getByLabel("Nombre de la institución").fill(institution);
  await page.getByLabel("Tipo", { exact: true }).selectOption({ label: "Colegio" });
  await page.getByRole("button", { name: "Crear institución" }).click();
  await expect(page.getByText("Puede que esta institución ya exista")).toBeVisible();
  await expect(page).toHaveURL(/\/instituciones\/nueva/);
});

test("el calendario muestra la actividad de la semana", async ({ page }) => {
  await page.goto("/calendario?semana=2030-01-14");
  await expect(page.getByRole("region", { name: /15 de ene/ }).getByText("Presentación a dirección").first()).toBeVisible();
});

test("en celular el menú lleva a Mi día", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Menú").click();
  await page.getByRole("link", { name: /Mi día/ }).first().click();
  await expect(page.getByRole("heading", { name: "Mi día" })).toBeVisible();
});

test("administra ámbitos y no permite auto-bloquearse", async ({ page }) => {
  await page.goto("/administracion");
  await page.getByRole("row", { name: new RegExp(E2E_USER.email) }).getByRole("link").click();
  await expect(page.getByText("No puedes desactivar tu propio usuario.")).toBeVisible();
  await page.getByLabel("Ámbito").selectOption({ label: "Toda la organización: E2Square" });
  await page.getByRole("button", { name: "Agregar ámbito" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Toda la organización: E2Square" })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Toda la organización: E2Square" }).getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Solo su propia cartera.")).toBeVisible();
});

test("la bitácora muestra quién cambió los ámbitos", async ({ page }) => {
  await page.goto("/administracion");
  await page.getByRole("link", { name: "Bitácora de auditoría" }).click();
  await page.getByLabel("Módulo").selectOption({ label: "Ámbitos" });
  await page.getByRole("button", { name: "Aplicar" }).click();
  const row = page.getByRole("row").filter({ hasText: "Baja" }).first();
  await expect(row).toContainText("scope_type: organization");
  await expect(row).not.toContainText("Sistema");
});

test("activa y desactiva una automatización", async ({ page }) => {
  await page.goto("/administracion");
  const rule = page.getByRole("listitem").filter({ hasText: "Primer contacto." });
  await rule.getByRole("checkbox").check();
  await rule.getByLabel("Vence en (días)").fill("2");
  await rule.getByRole("button", { name: "Guardar" }).click();
  await expect(rule.getByText("Regla activada.")).toBeVisible();
  await page.reload();
  await expect(rule.getByRole("checkbox")).toBeChecked();
  await expect(rule.getByLabel("Vence en (días)")).toHaveValue("2");
  await rule.getByRole("checkbox").uncheck();
  await rule.getByRole("button", { name: "Guardar" }).click();
  await expect(rule.getByText("Regla desactivada.")).toBeVisible();
});

test("integraciones explica qué falta si Google no está configurado", async ({ page }) => {
  await page.getByRole("link", { name: "Integraciones" }).first().click();
  await expect(page.getByRole("heading", { name: "Integraciones" })).toBeVisible();
  await expect(page.getByText("Pendiente: el administrador debe registrar las credenciales de Google")).toBeVisible();
  await page.goto("/api/google/connect");
  await expect(page.getByText("La integración con Google aún no está configurada")).toBeVisible();
});

test("cierra sesión", async ({ page }) => {
  await page.getByRole("button", { name: /Cerrar sesión|Salir/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
