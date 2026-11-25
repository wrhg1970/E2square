"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/action-state";
import { readImportInput } from "@/modules/import/read-rows";
import { normalizeText } from "@/modules/institutions/labels";
import type { ImportResult } from "@/modules/institutions/import-action";
import { parseOpportunityRows } from "./import-parse";

// shortcut: una llamada a import_opportunity por fila; con más de 1000 filas conviene una función por lote.
const MAX_ROWS = 1000;

type Named = { id: string; name: string };

// Índice por nombre normalizado; null marca nombres repetidos (ambiguos).
function index<T extends Named>(items: T[], extra: (t: T) => string[] = () => []) {
  const m = new Map<string, T | null>();
  for (const it of items) {
    for (const k of new Set([it.name, ...extra(it)].map(normalizeText))) m.set(k, m.has(k) ? null : it);
  }
  return m;
}

export async function importOpportunities(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const mode = formData.get("mode") === "commit" ? "commit" : "preview";

  const supabase = await createClient();
  const [{ data: canImport }, { data: orgId }, { data: profileId }] = await Promise.all([
    supabase.rpc("has_permission", { permission: "import.run" }),
    supabase.rpc("current_org_id"),
    supabase.rpc("current_profile_id"),
  ]);
  if (!canImport || !orgId || !profileId) return { error: "No tienes permiso para importar." };

  const input = await readImportInput(formData, supabase);
  if ("error" in input) return input;
  const { rows, name: fileName } = input;
  if (rows.length - 1 > MAX_ROWS) return { error: `Hay más de ${MAX_ROWS} filas. Divide los datos en partes.` };
  const { valid, errors, unknownColumns } = parseOpportunityRows(rows);
  if (!rows[0]?.length || valid.length + errors.length === 0) return { error: "No hay filas de datos." };
  const total = valid.length + new Set(errors.map((e) => e.row)).size;

  // Instituciones visibles (paginado: PostgREST devuelve máximo 1000 por consulta).
  const institutions: Named[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("institutions").select("id, name").order("id").range(from, from + 999);
    institutions.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const [{ data: products }, { data: profiles }] = await Promise.all([
    supabase.from("products").select("id, name, code, supplier_id, default_pipeline_id"),
    supabase.from("profiles").select("id, email"),
  ]);
  const instByName = index(institutions);
  const suppliers = index((products ?? []).filter((p) => !p.supplier_id && p.default_pipeline_id), (p) => [p.code]);
  const profileByEmail = new Map((profiles ?? []).map((p) => [p.email.toLowerCase(), p.id]));

  const resolved: { row: number; label: string; args: Record<string, unknown>; key: string }[] = [];
  for (const r of valid) {
    const fail = (field: string, message: string) => errors.push({ row: r.row, field, message });
    const inst = instByName.get(normalizeText(r.institution));
    if (inst === null) { fail("institution", `Hay varias instituciones llamadas "${r.institution}". Renombra una antes de importar.`); continue; }
    if (!inst) { fail("institution", `No existe la institución "${r.institution}" (o no la puedes ver). Impórtala primero.`); continue; }
    const sup = suppliers.get(normalizeText(r.supplier));
    if (!sup) { fail("supplier", sup === null ? `Proveedor ambiguo: "${r.supplier}". Usa su código.` : `No existe el proveedor "${r.supplier}".`); continue; }
    let productId: string | null = null;
    if (r.product) {
      const prod = index((products ?? []).filter((p) => p.supplier_id === sup.id), (p) => [p.code]).get(normalizeText(r.product));
      if (!prod) { fail("product", `"${r.product}" no es un producto de ${sup.name}.`); continue; }
      productId = prod.id;
    }
    let ownerId: string | null = null;
    if (r.owner) {
      ownerId = profileByEmail.get(r.owner) ?? null;
      if (!ownerId) { fail("owner", `No hay un usuario con el correo ${r.owner}.`); continue; }
    }
    const name = r.name || `${sup.name} · ${inst.name}`;
    resolved.push({
      row: r.row,
      label: `${name} · ${inst.name} · ${r.currency} ${r.amount.toLocaleString("es-MX")} · ${({ open: "Abierta", won: "Ganada", lost: "Perdida" })[r.status]}`,
      key: `${inst.id}|${normalizeText(name)}|${r.close_date ?? ""}`,
      args: {
        p_institution: inst.id, p_supplier: sup.id, p_product: productId, p_name: r.name || null, p_owner: ownerId,
        p_currency: r.currency, p_amount: r.amount, p_cost: r.cost ?? null, p_status: r.status,
        p_close_date: r.close_date ?? null, p_loss_reason: r.loss_reason || null,
      },
    });
  }

  // Duplicados: misma institución, nombre y fecha de cierre, ya en la base o repetidos en el archivo.
  const instIds = [...new Set(resolved.map((r) => r.args.p_institution as string))];
  const existing = new Set<string>();
  for (let i = 0; i < instIds.length; i += 200) {
    const { data } = await supabase.from("opportunities").select("institution_id, name, expected_close_date")
      .in("institution_id", instIds.slice(i, i + 200));
    for (const o of data ?? []) existing.add(`${o.institution_id}|${normalizeText(o.name)}|${o.expected_close_date ?? ""}`);
  }
  const duplicates: { row: number; name: string; match: string }[] = [];
  const fresh: typeof resolved = [];
  for (const r of resolved) {
    if (existing.has(r.key)) duplicates.push({ row: r.row, name: r.label, match: "con la misma institución, nombre y fecha" });
    else { existing.add(r.key); fresh.push(r); }
  }

  let created = 0;
  if (mode === "commit" && fresh.length) {
    for (const r of fresh) {
      const { error } = await supabase.rpc("import_opportunity", r.args as never);
      if (error) errors.push({ row: r.row, field: "row", message: dbErrorMessage(error) });
      else created++;
    }
    const badRows = new Set(errors.map((e) => e.row)).size;
    await supabase.from("import_runs").insert({
      organization_id: orgId,
      entity: "opportunities",
      file_name: fileName.slice(0, 200),
      total_rows: total,
      created_rows: created,
      skipped_rows: duplicates.length + badRows,
      errors: errors.slice(0, 500),
      created_by: profileId,
    });
    revalidatePath("/oportunidades");
  }

  return {
    mode,
    fileName,
    total,
    ready: fresh.map((r) => ({ row: r.row, label: r.label })),
    duplicates,
    errors,
    unknownColumns,
    created,
  };
}
