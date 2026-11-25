"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/action-state";
import { readImportInput } from "@/modules/import/read-rows";
import { zonedToUtc } from "@/modules/activities/time";
import type { ImportResult } from "@/modules/institutions/import-action";
import type { RowError } from "@/modules/institutions/import-parse";
import { parseLeadRows } from "./import-parse";

const MAX_ROWS = 2000;
const productId = z.union([z.literal(""), z.uuid()]);

export async function importLeads(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const mode = formData.get("mode") === "commit" ? "commit" : "preview";
  const product = productId.safeParse(String(formData.get("product_id") ?? ""));
  if (!product.success) return { error: "Elige un producto de la lista." };

  const supabase = await createClient();
  const [{ data: canImport }, { data: orgId }, { data: profileId }] = await Promise.all([
    supabase.rpc("has_permission", { permission: "import.run" }),
    supabase.rpc("current_org_id"),
    supabase.rpc("current_profile_id"),
  ]);
  if (!canImport || !orgId || !profileId) return { error: "No tienes permiso para importar." };
  if (product.data) {
    const { data } = await supabase.from("products").select("id").eq("id", product.data).maybeSingle();
    if (!data) return { error: "Ese producto no existe o no lo puedes ver." };
  }

  const input = await readImportInput(formData, supabase);
  if ("error" in input) return input;
  const { rows, name: fileName } = input;
  if (rows.length - 1 > MAX_ROWS) return { error: `Hay más de ${MAX_ROWS} filas. Divide los datos en partes.` };
  const { valid, errors, unknownColumns } = parseLeadRows(rows);
  if (!rows[0]?.length || valid.length + errors.length === 0) return { error: "No hay filas de datos." };
  const total = valid.length + new Set(errors.map((e) => e.row)).size;

  // Ya importados: mismo Lead ID o mismo correo, en la base o más arriba en la misma hoja.
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const ids = [...new Set(valid.flatMap((r) => (r.external_id ? [r.external_id] : [])))];
  const emails = [...new Set(valid.flatMap((r) => (r.email ? [r.email] : [])))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("leads").select("external_id").eq("source", "meta").in("external_id", ids.slice(i, i + 200));
    for (const l of data ?? []) seenIds.add(l.external_id as string);
  }
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("leads").select("email").in("email", emails.slice(i, i + 200));
    for (const l of data ?? []) seenEmails.add(l.email as string);
  }
  const duplicates: { row: number; name: string; match: string }[] = [];
  const fresh: typeof valid = [];
  for (const r of valid) {
    const match = r.external_id && seenIds.has(r.external_id) ? `con el Lead ID ${r.external_id}` : r.email && seenEmails.has(r.email) ? `con el correo ${r.email}` : null;
    if (match) { duplicates.push({ row: r.row, name: r.full_name, match }); continue; }
    if (r.external_id) seenIds.add(r.external_id);
    if (r.email) seenEmails.add(r.email);
    fresh.push(r);
  }

  let created = 0;
  if (mode === "commit" && fresh.length) {
    const toRow = ({ date, time, ...r }: (typeof fresh)[number]) => ({
      ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== "row")),
      // Hora del centro de México; sin hora se usa mediodía para no cambiar de día.
      received_at: date ? zonedToUtc(`${date}T${time ?? "12:00"}`, "America/Mexico_City").toISOString() : null,
      source: "meta", product_id: product.data || null, owner_id: profileId, organization_id: orgId, created_by: profileId,
    });
    const { data, error } = await supabase.from("leads").insert(fresh.map(toRow)).select("id");
    if (!error) created = data.length;
    else {
      // Un Lead ID que ya importó otra persona (y no ves) rechaza el lote: se reintenta fila por fila.
      for (const r of fresh) {
        const res = await supabase.from("leads").insert(toRow(r));
        if (!res.error) created++;
        else if (res.error.code === "23505") duplicates.push({ row: r.row, name: r.full_name, match: "importado antes por otra persona" });
        else errors.push({ row: r.row, field: "row", message: dbErrorMessage(res.error) } satisfies RowError);
      }
    }
    await supabase.from("import_runs").insert({
      organization_id: orgId, entity: "leads", file_name: fileName.slice(0, 200), total_rows: total, created_rows: created,
      skipped_rows: total - created, errors: errors.slice(0, 500), created_by: profileId,
    });
    revalidatePath("/prospectos");
  }

  return {
    mode,
    fileName,
    total,
    ready: fresh.map((r) => ({ row: r.row, label: [r.full_name, r.email ?? r.phone, r.city].filter(Boolean).join(" · ") })),
    duplicates,
    errors,
    unknownColumns,
    created,
  };
}
