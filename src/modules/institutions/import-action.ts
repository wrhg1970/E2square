"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { linkContact } from "./contacts";
import { readImportInput } from "@/modules/import/read-rows";
import { parseRows, type RowError } from "./import-parse";

export type ImportResult = {
  mode: "preview" | "commit";
  fileName: string;
  total: number;
  ready: { row: number; label: string }[];
  duplicates: { row: number; name: string; match: string }[];
  errors: RowError[];
  unknownColumns: string[];
  created: number;
} | { error: string } | null;

// shortcut: revisa duplicados fila por fila (una consulta por fila); subir el límite exige hacerlo en lote en SQL.
const MAX_ROWS = 1000;

export async function importInstitutions(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
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

  const { valid, errors, unknownColumns } = parseRows(rows);
  if (!rows[0]?.length || valid.length + errors.length === 0) return { error: "No hay filas de datos." };

  // Duplicados contra la base: nunca se sobrescriben, solo se reportan.
  const duplicates: { row: number; name: string; match: string }[] = [];
  const fresh: typeof valid = [];
  for (let i = 0; i < valid.length; i += 20) {
    const batch = valid.slice(i, i + 20);
    const results = await Promise.all(
      batch.map((r) =>
        supabase.rpc("find_institution_duplicates", {
          p_name: r.institution.name,
          p_website: r.institution.website ?? null,
          p_phone: r.institution.phone ?? null,
          p_tax_id: r.institution.tax_id ?? null,
        }),
      ),
    );
    results.forEach(({ data }, k) => {
      const r = batch[k];
      if (data?.length) duplicates.push({ row: r.row, name: r.institution.name, match: `${data[0].name} (${data[0].reason})` });
      else fresh.push(r);
    });
  }

  let created = 0;
  if (mode === "commit" && fresh.length) {
    const { data: inserted, error } = await supabase
      .from("institutions")
      .insert(fresh.map((r) => ({ ...r.institution, owner_id: profileId, organization_id: orgId, created_by: profileId })))
      .select("id");
    if (error) return { error: "No se pudo importar. No se guardó ninguna fila." };
    created = inserted.length;
    // El insert devuelve las filas en el mismo orden en que se enviaron.
    for (const [k, r] of fresh.entries()) {
      if (!r.contact) continue;
      const { job_title, department, decision_role, ...person } = r.contact;
      delete (person as { is_primary?: boolean }).is_primary;
      const res = await linkContact(supabase, orgId, profileId, inserted[k].id, person, {
        job_title, department, decision_role, is_primary: true, // el primer contacto de una institución nueva es el principal
      });
      if (res.error) errors.push({ row: r.row, field: "contact", message: `Institución creada, contacto no: ${res.error}` });
    }
    await supabase.from("import_runs").insert({
      organization_id: orgId,
      entity: "institutions",
      file_name: fileName.slice(0, 200),
      total_rows: valid.length + new Set(errors.map((e) => e.row)).size,
      created_rows: created,
      skipped_rows: duplicates.length + new Set(errors.map((e) => e.row)).size,
      errors: errors.slice(0, 500),
      created_by: profileId,
    });
    revalidatePath("/instituciones");
  }

  return {
    mode,
    fileName,
    total: valid.length + new Set(errors.map((e) => e.row)).size,
    ready: fresh.map((r) => ({
      row: r.row,
      label: [r.institution.name, r.institution.city].filter(Boolean).join(", ")
        + (r.contact ? ` · ${`${r.contact.first_name} ${r.contact.last_name}`.trim()}` : ""),
    })),
    duplicates,
    errors,
    unknownColumns,
    created,
  };
}
