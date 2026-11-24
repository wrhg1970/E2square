import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_USER, localSupabase } from "./global-setup";

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
  await page.getByLabel("Teléfono / WhatsApp").fill("+52 222 555 0101");
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
  await expect(page.getByRole("heading", { name: /^Puntaje/ })).toBeVisible();
  await expect(page.getByText("Acceso a decisores")).toBeVisible();
  await expect(page.getByText(/^Calculado:/)).toBeVisible();

  const instUrl = page.url();
  await page.goto(`/oportunidades/nueva?institucion=${instUrl.split("/").pop()}`);
  await page.getByLabel("Proveedor").selectOption({ label: "IHS" });
  await page.getByLabel("Nombre", { exact: true }).fill(`IHS ${stamp}`);
  await page.getByLabel("Moneda").selectOption("USD");
  await page.getByLabel("Cierre estimado").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Crear oportunidad" }).click();
  await expect(page.getByRole("heading", { name: `IHS ${stamp}` })).toBeVisible();

  await page.getByText(/Agregar producto/).click();
  await expect(page.getByRole("heading", { name: "Resumen y riesgos (IA)" })).toBeVisible();
  await expect(page.getByText("Pendiente: el administrador debe configurar la IA.")).toBeVisible();
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

  await page.goto(instUrl);
  const offer = page.getByText("Proveedores que aún no le has ofrecido").locator("..");
  await expect(offer).toBeVisible();
  await expect(offer.getByRole("link", { name: "IHS" })).toHaveCount(0);
  await offer.getByRole("link").first().click();
  await expect(page.getByLabel("Proveedor")).not.toHaveValue("");
});

test("la venta ganada genera su comisión pendiente", async ({ page }) => {
  await page.goto("/comisiones");
  const row = page.getByRole("row").filter({ hasText: `IHS ${stamp}` }).filter({ hasText: "Margen:" });
  await expect(row).toContainText("Margen: USD 600"); // venta 1,000 - costo 400
  await expect(row.getByRole("cell", { name: "USD 60", exact: true })).toBeVisible(); // 10% del margen
  await expect(row.getByRole("button", { name: "Aprobar" })).toHaveCount(0); // nadie aprueba la suya
  await expect(page.getByRole("region", { name: "Resumen del mes" })).toContainText(/Por aprobar\s*USD/);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar CSV" }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv).toContain("Fecha,Agente,Oportunidad,Producto,Tipo,Reparto %,Base,Monto base,%,Comisión,Moneda,Estado");
  expect(csv).toMatch(new RegExp(`IHS ${stamp}.*,Venta,100,Margen,600,10,60,USD,Pendiente`));
  await page.goto("/comisiones?mes=2020-01&estado=all");
  await expect(page.getByText("No hay comisiones en este estado este mes.")).toBeVisible();
});

test("avisa antes de crear una institución duplicada", async ({ page }) => {
  await page.goto("/instituciones/nueva");
  await page.getByLabel("Nombre de la institución").fill(institution);
  await page.getByLabel("Tipo", { exact: true }).selectOption({ label: "Colegio" });
  await page.getByRole("button", { name: "Crear institución" }).click();
  await expect(page.getByText("Puede que esta institución ya exista")).toBeVisible();
  await expect(page).toHaveURL(/\/instituciones\/nueva/);
});

test("la búsqueda de datos explica qué falta y no consulta redes internas", async ({ page }) => {
  await page.goto("/instituciones/nueva");
  const buscar = page.getByLabel("Buscar datos de la institución");
  await buscar.fill("Colegio Americano de Puebla");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Para buscar por nombre falta configurar la IA")).toBeVisible();
  await buscar.fill("localhost.localdomain");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("No encontramos información")).toBeVisible();
});

test("el calendario muestra la actividad de la semana", async ({ page }) => {
  await page.goto("/calendario?semana=2030-01-14");
  await expect(page.getByRole("region", { name: /15 de ene/ }).getByText("Presentación a dirección").first()).toBeVisible();
});

test("el recordatorio aparece en Mi día antes de la fecha", async ({ page }) => {
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(Date.now() + 86_400_000);
  await page.goto("/mi-dia");
  // Acotado al formulario: de corridas anteriores puede haber otras actividades con su propio "Fecha y hora".
  const form = page.locator("details").filter({ hasText: "Tarea interna o actividad sin institución" });
  await form.getByText("Tarea interna o actividad sin institución").click();
  await form.getByLabel("Asunto").fill(`Recordar ${stamp}`);
  await form.getByLabel("Fecha y hora").fill(`${tomorrow}T00:01`);
  await form.getByLabel("Recordatorio").selectOption({ label: "1 día antes" });
  await form.getByRole("button", { name: "Guardar actividad" }).click();
  await expect(form.getByText("Actividad programada.")).toBeVisible();
  await page.reload();
  const block = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Recordatorios/ }) });
  await expect(block.getByText(`Recordar ${stamp}`)).toBeVisible();
});

test("en celular el menú lleva a Mi día", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Menú").click();
  await page.getByRole("link", { name: /Mi día/ }).first().click();
  await expect(page.getByRole("heading", { name: "Mi día" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Instituciones para abrir oportunidad/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Cierre estimado ya pasó/ })).toBeVisible();
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

test("la auditoría financiera filtra montos y comisiones y se exporta", async ({ page }) => {
  await page.goto("/administracion/bitacora");
  await page.getByLabel("Módulo").selectOption({ label: "Financiero (montos, precios, tipos de cambio, comisiones)" });
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("cell", { name: "Comisiones" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ámbitos" })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar CSV" }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv).toContain("Fecha,Usuario,Módulo,Acción,Registro,Detalle");
  expect(csv).toContain("Comisiones");
  expect(csv).not.toContain("Ámbitos");
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

test("ajusta los pesos del puntaje y valida en servidor", async ({ page }) => {
  await page.goto("/administracion");
  const form = page.locator("section").filter({ hasText: "Puntaje de instituciones" });
  await form.getByLabel("Urgencia").fill("12");
  await form.getByRole("button", { name: "Guardar pesos" }).click();
  await expect(form.getByText("Pesos del puntaje guardados.")).toBeVisible();
  await page.reload();
  await expect(form.getByLabel("Urgencia")).toHaveValue("12");
  await form.getByLabel("Urgencia").fill("10");
  await form.getByRole("button", { name: "Guardar pesos" }).click();
  await expect(form.getByText("Pesos del puntaje guardados.")).toBeVisible();
  await page.goto("/instituciones");
  await expect(page.getByRole("columnheader", { name: "Puntaje" })).toBeVisible();
});

test("conecta WhatsApp y registra solo mensajes firmados por Meta", async ({ page, request }) => {
  const phoneId = String(Date.now()).slice(-12);
  const secret = "0123456789abcdef0123456789abcdef";
  await page.getByRole("link", { name: "Integraciones" }).first().click();
  await expect(page.getByText("Pendiente: ningún número conectado.")).toBeVisible();
  await page.getByText("Conectar o actualizar un número").click();
  await page.getByLabel("Phone number ID").fill(phoneId);
  await page.getByLabel("Número visible").fill("+52 55 0000 0000");
  await page.getByLabel("App Secret").fill(secret);
  await page.getByRole("button", { name: "Guardar número" }).click();
  const saved = page.getByText(/Token de verificación para Meta/);
  await expect(saved).toBeVisible();
  const token = (await saved.textContent())!.split(": ").pop()!.trim();

  const hook = "/api/whatsapp/webhook";
  const ok = await request.get(`${hook}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=reto123`);
  expect(await ok.text()).toBe("reto123");
  expect((await request.get(`${hook}?hub.mode=subscribe&hub.verify_token=token-equivocado-xyz&hub.challenge=1`)).status()).toBe(403);

  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: phoneId }, messages: [{ id: `wamid.${stamp}`, from: "5215598765432", timestamp: "1795000000", type: "text", text: { body: `Hola E2E ${stamp}` } }] } }] }] });
  const sig = (s: string) => `sha256=${createHmac("sha256", s).update(body).digest("hex")}`;
  const headers = { "content-type": "application/json" };
  expect((await request.post(hook, { data: body, headers: { ...headers, "x-hub-signature-256": sig("otro-secreto") } })).status()).toBe(401);
  expect((await request.post(hook, { data: body, headers: { ...headers, "x-hub-signature-256": sig(secret) } })).status()).toBe(200);

  await page.reload();
  await expect(page.getByText(`WhatsApp: Hola E2E ${stamp}`)).toBeVisible();
  await expect(page.getByText("Último mensaje recibido")).toBeVisible();
  await page.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(page.getByText("Pendiente: ningún número conectado.")).toBeVisible();

  await page.getByText("Registrar plantilla").click();
  await page.getByLabel("Nombre en Meta").fill(`seguimiento_${stamp}`);
  await page.getByLabel("Texto (para vista previa)").fill("Hola {{1}}, ¿pudiste revisar la propuesta?");
  await page.getByRole("button", { name: "Agregar plantilla" }).click();
  await expect(page.getByText(`seguimiento_${stamp}`)).toBeVisible();
  await expect(page.getByText(/Envío: pendiente/)).toBeVisible();

  await page.goto(`/instituciones?q=${encodeURIComponent(institution)}`);
  await page.getByRole("link", { name: institution }).first().click();
  await page.getByText("Consentimiento de WhatsApp").first().click();
  await page.getByLabel("Cómo lo autorizó").fill("Formulario de feria");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Aceptó WhatsApp", { exact: true })).toBeVisible();
  // Sin token de Meta en el servidor no se ofrece enviar.
  await expect(page.getByText("Enviar WhatsApp")).toHaveCount(0);
});

test("crea un proveedor con sus productos y los busca", async ({ page }) => {
  const code = `E2E${String(stamp).slice(-6)}`;
  await page.getByRole("link", { name: "Proveedores" }).first().click();
  await expect(page.getByRole("heading", { name: "Proveedores" })).toBeVisible();
  await page.getByText("Agregar proveedor").click();
  await page.getByLabel("Clave").fill(code);
  await page.getByLabel("Nombre").fill(`Proveedor ${code}`);
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Proveedor ${code}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productos (0)" })).toBeVisible();
  const add = page.locator("details").filter({ hasText: "Agregar producto" });
  await add.getByLabel("Clave").fill(`${code}-A`);
  await add.getByLabel("Nombre").fill(`Curso ${code}`);
  await add.getByRole("button", { name: "Agregar producto" }).click();
  await expect(page.getByRole("heading", { name: "Productos (1)" })).toBeVisible();
  await page.goto(`/productos?q=curso ${code.toLowerCase()}`);
  await expect(page.getByRole("link", { name: `Proveedor ${code}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "IHS", exact: true })).toHaveCount(0);
});

test("administración muestra el estado de las integraciones", async ({ page }) => {
  await page.goto("/administracion");
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Estado de integraciones" }) });
  await expect(panel.getByText("faltan las credenciales en el servidor")).toBeVisible();
  await expect(panel.getByText("IA: sin configurar")).toBeVisible();
  await expect(panel.getByText("Nadie ha conectado su cuenta de Google todavía.")).toBeVisible();
});

test("integraciones explica qué falta si Google no está configurado", async ({ page }) => {
  await page.getByRole("link", { name: "Integraciones" }).first().click();
  await expect(page.getByRole("heading", { name: "Integraciones" })).toBeVisible();
  await expect(page.getByText("Pendiente: el administrador debe registrar las credenciales de Google")).toBeVisible();
  await expect(page.getByText("Pendiente: el administrador debe elegir Gemini o Claude")).toBeVisible();
  await page.goto("/api/google/connect");
  await expect(page.getByText("La integración con Google aún no está configurada")).toBeVisible();
});

test("arma, lanza y mide una campaña", async ({ page }) => {
  const name = `Campaña E2E ${stamp}`;
  await page.goto("/campanas");
  await page.getByText("Nueva campaña").click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Inicio").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  for (const [day, type, subject] of [["0", "Llamada", "Invitar"], ["3", "Correo", "Enviar folleto"]]) {
    await page.getByLabel("Día", { exact: true }).fill(day);
    await page.getByLabel("Tipo de paso").selectOption({ label: type });
    await page.getByLabel("Qué hacer").fill(subject);
    await page.getByRole("button", { name: "Agregar paso" }).click();
    await expect(page.getByText(`${type} · ${subject}`)).toBeVisible();
  }
  await page.getByLabel("Colegio", { exact: true }).check();
  await page.getByRole("button", { name: "Agregar a la audiencia" }).click();
  await expect(page.getByText(/Se agregaron \d+ instituciones/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Quitar" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Lanzar campaña" }).click();
  await expect(page.getByText(/^Lanzada el /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar paso" })).toHaveCount(0);
  await expect(page.getByText("Correo · Enviar folleto")).toBeVisible();
  await expect(page.getByText(/Activa/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear oportunidad" }).first()).toBeVisible();
  const pending = page.getByText("Tareas pendientes").locator("..");
  await expect(pending.getByText(/^[1-9]\d*$/)).toBeVisible();
});

test("busca documentos y muestra sus versiones", async ({ page }) => {
  // Storage no corre en local: se registran los documentos directo en la base y se prueba lista, búsqueda y versiones.
  const { url, key } = localSupabase();
  const rest = (path: string, init?: RequestInit) => fetch(`${url}/rest/v1/${path}`, {
    ...init, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
  }).then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); });
  const [inst] = await rest(`institutions?select=id,organization_id,owner_id&name=eq.${encodeURIComponent(institution)}&limit=1`);
  const doc = (n: number) => ({ organization_id: inst.organization_id, storage_path: `${inst.organization_id}/${stamp}-v${n}.pdf`,
    file_name: `Propuesta ${stamp}.pdf`, mime_type: "application/pdf", size_bytes: 2048, category: "proposal", institution_id: inst.id, uploaded_by: inst.owner_id });
  const [v1] = await rest("documents", { method: "POST", body: JSON.stringify(doc(1)) });
  await rest("documents", { method: "POST", body: JSON.stringify({ ...doc(2), root_id: v1.root_id }) });

  await page.getByRole("link", { name: "Documentos" }).first().click();
  await page.getByLabel("Buscar").fill(`Propuesta ${stamp}`);
  await page.getByRole("button", { name: "Buscar" }).click();
  const rows = page.getByRole("row").filter({ hasText: `Propuesta ${stamp}.pdf` });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "v2" })).toHaveCount(1);
  await rows.first().getByRole("link", { name: institution }).click();
  await expect(page.getByRole("heading", { name: institution })).toBeVisible();
  await expect(page.getByText("Versiones anteriores (1)")).toBeVisible();
  await expect(page.getByText("Subir nueva versión")).toBeVisible();
  await page.goto("/documentos?q=no-existe-zzz");
  await expect(page.getByText("Ningún documento coincide con la búsqueda.")).toBeVisible();
});

test("configura bono, escalones y cobranza de comisiones", async ({ page }) => {
  await page.goto("/comisiones");
  await page.getByLabel("Escalones (% meta : % extra)").fill("cien");
  await page.getByRole("button", { name: "Guardar esquemas" }).click();
  await expect(page.getByText("Escribe los escalones como 100:1, 120:2")).toBeVisible();
  await page.getByLabel("Bono por institución nueva").fill("500");
  await page.getByLabel("Moneda del bono").selectOption("MXN");
  await page.getByLabel("Escalones (% meta : % extra)").fill("120:2, 100:1");
  await page.getByRole("button", { name: "Guardar esquemas" }).click();
  await expect(page.getByText("Esquemas guardados")).toBeVisible();
  await page.reload();
  await expect(page.getByText("al 100% de la meta, +1%; al 120% de la meta, +2%")).toBeVisible();
  await expect(page.getByText(/\$500(\.00)? al responsable/)).toBeVisible();
  // La venta ganada del flujo espera el pago del cliente antes de pagar comisiones.
  await page.getByRole("row").filter({ hasText: `IHS ${stamp}` }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Comisión" })).toBeVisible();
  await expect(page.getByText("El cliente aún no ha pagado.")).toBeVisible();
});

test("crea una meta trimestral, muestra su ritmo y la repite", async ({ page }) => {
  const name = `Meta E2E ${stamp}`;
  await page.goto("/metas");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Qué se mide").selectOption({ label: "Unidades vendidas" });
  await page.getByLabel("Objetivo", { exact: true }).fill("100");
  await page.getByLabel("Periodo", { exact: true }).selectOption({ label: "Trimestre" });
  await page.getByLabel("Desde (o cualquier día del periodo)").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Crear meta" }).click();
  await expect(page.getByText("Meta creada.")).toBeVisible();
  const goal = page.getByRole("listitem").filter({ hasText: name });
  await expect(goal).toHaveCount(1);
  await expect(goal.getByText(/^Ritmo: a hoy debería ir en \d+%/)).toBeVisible();
  await goal.getByRole("button", { name: "Repetir en el siguiente periodo" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(2);
});

test("importa ventas históricas con vista previa y sin duplicar", async ({ page }) => {
  const csv = [
    "institucion,oportunidad,proveedor,monto,moneda,estado,fecha_cierre",
    `${institution},Histórica ${stamp},IHS,"$1,500.00",MXN,Ganada,30/06/2025`,
    `${institution},Sin fecha ${stamp},IHS,100,MXN,Ganada,`,
    `Colegio Inexistente ${stamp},X,IHS,100,MXN,Abierta,`,
  ].join("\n");
  const file = { name: "ventas.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
  await page.goto("/oportunidades");
  await page.getByRole("link", { name: "Importar Excel" }).click();
  await expect(page.getByRole("heading", { name: "Importar oportunidades" })).toBeVisible();
  await page.getByLabel(/Archivo/).setInputFiles(file);
  await page.getByRole("button", { name: "Continuar" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("3 filas · 1 listas · 0 posibles duplicados · 2 con errores");
  await expect(status).toContainText("necesitan fecha de cierre");
  await expect(status).toContainText(`No existe la institución "Colegio Inexistente ${stamp}"`);
  await expect(status).toContainText(`Histórica ${stamp} · ${institution} · MXN 1,500 · Ganada`);

  await page.getByLabel(/Archivo/).setInputFiles(file);
  await page.getByLabel("Importar las filas listas").check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(status).toContainText("Se crearon 1 oportunidades");

  // Repetir el archivo no duplica.
  await page.getByLabel(/Archivo/).setInputFiles(file);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(status).toContainText("0 listas · 1 posibles duplicados");
});

test("reparte una meta general entre vendedores", async ({ page }) => {
  // Dos vendedores nuevos: invitación en la app + usuario en Auth local (el perfil se crea al aceptar).
  const { url, key } = localSupabase();
  const sellers = [`vende1-${stamp}@e2square.test`, `vende2-${stamp}@e2square.test`];
  await page.goto("/administracion");
  const invite = page.locator("form").filter({ has: page.getByRole("button", { name: "Invitar" }) });
  for (const email of sellers) {
    await invite.getByLabel("Correo").fill(email);
    await invite.getByLabel("Rol").selectOption({ index: 1 });
    await invite.getByRole("button", { name: "Invitar" }).click();
    await expect(page.getByRole("cell", { name: email })).toBeVisible();
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Prueba-E2E-2027", email_confirm: true }),
    });
    expect(res.ok).toBe(true);
  }

  const name = `Reparto E2E ${stamp}`;
  await page.goto("/metas");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Qué se mide").selectOption({ label: "Unidades vendidas" });
  await page.getByLabel("Objetivo", { exact: true }).fill("9");
  await page.getByLabel("Periodo", { exact: true }).selectOption({ label: "Mes" });
  await page.getByLabel("Desde (o cualquier día del periodo)").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Crear meta" }).click();
  await expect(page.getByText("Meta creada.")).toBeVisible();

  const goal = page.getByRole("listitem").filter({ hasText: name });
  await goal.getByText("Repartir entre vendedores").click();
  for (const email of sellers) await goal.getByRole("checkbox", { name: email }).check();
  await goal.getByLabel(`Objetivo de ${sellers[0]}`).fill("5");
  await goal.getByRole("button", { name: "Repartir" }).click();
  await expect(goal.getByText(/^Captura el objetivo de cada vendedor/)).toBeVisible();

  await goal.getByLabel(`Objetivo de ${sellers[0]}`).fill("");
  await goal.getByRole("button", { name: "Repartir" }).click();
  await expect(page.getByText("Meta repartida entre 2 vendedores.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: `Reparto de: ${name}` })).toHaveCount(2);
  await expect(page.getByRole("listitem").filter({ hasText: `${name} · ${sellers[0]}` })).toContainText("de 5");
  await expect(page.getByRole("listitem").filter({ hasText: `${name} · ${sellers[1]}` })).toContainText("de 4");
});

test("consulta la venta por vendedor sin IA", async ({ page }) => {
  await page.getByRole("link", { name: "Consultas" }).first().click();
  await expect(page.getByRole("heading", { name: "Consultas" })).toBeVisible();
  await expect(page.getByText(/se activan cuando el administrador configure la IA/)).toBeVisible();
  await page.getByLabel("Qué medir").selectOption({ label: "Unidades vendidas" });
  await page.getByLabel("Agrupar por").selectOption({ label: "Vendedor" });
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByRole("heading", { name: /^Unidades vendidas por vendedor/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Unidades vendidas" }).getByRole("rowheader").first()).toBeVisible();
  await page.goto("/consultas?metric=salarios&group=total&from=2026-01-01&to=2026-12-31");
  await expect(page.getByRole("alert").filter({ hasText: "Elige qué medir" })).toBeVisible();
});

test("cierra sesión", async ({ page }) => {
  await page.getByRole("button", { name: /Cerrar sesión|Salir/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
