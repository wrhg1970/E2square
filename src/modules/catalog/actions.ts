"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { priceItemSchema, productSchema, requirementsFrom, stageSchema } from "./schemas";

const DEFAULT_STAGES = [
  { name: "Lead", default_probability: 10, required_fields: [], sla_days: 3, is_won: false, is_lost: false },
  { name: "Calificado", default_probability: 25, required_fields: [], sla_days: 7, is_won: false, is_lost: false },
  { name: "Propuesta", default_probability: 50, required_fields: ["items"], sla_days: 10, is_won: false, is_lost: false },
  { name: "Negociación", default_probability: 75, required_fields: ["items", "expected_close_date"], sla_days: 14, is_won: false, is_lost: false },
  { name: "Ganada", default_probability: 100, required_fields: ["items", "expected_close_date"], sla_days: null, is_won: true, is_lost: false },
  { name: "Perdida", default_probability: 0, required_fields: ["loss_reason"], sla_days: null, is_won: false, is_lost: true },
];

// Producto nuevo = producto + su pipeline con las etapas estándar (editables después).
export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("current_org_id");
  if (!org) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: product, error } = await supabase.from("products").insert({ ...parsed.data, organization_id: org }).select("id").single();
  if (error) return { error: error.code === "23505" ? "Ya existe un producto con esa clave." : dbErrorMessage(error) };
  const { data: pipeline, error: pErr } = await supabase
    .from("pipelines")
    .insert({ organization_id: org, name: `Pipeline ${parsed.data.name}`, product_id: product.id })
    .select("id")
    .single();
  if (pErr) return { error: `Producto creado, pero no su pipeline: ${dbErrorMessage(pErr)}` };
  await supabase
    .from("pipeline_stages")
    .insert(DEFAULT_STAGES.map((s, i) => ({ ...s, organization_id: org, pipeline_id: pipeline.id, sort_order: i + 1 })));
  await supabase.from("products").update({ default_pipeline_id: pipeline.id }).eq("id", product.id);
  revalidatePath("/productos");
  redirect(`/productos/${product.id}`);
}

export async function updateProduct(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(parsed.data).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar el catálogo." };
  revalidatePath(`/productos/${id}`);
  return { success: "Producto actualizado." };
}

export async function addPriceItem(productId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = priceItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("current_org_id");
  const { error } = await supabase.from("price_list_items").insert({ ...parsed.data, organization_id: org, product_id: productId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/productos/${productId}`);
  return { success: "Precio agregado." };
}

export async function updateStage(stageId: string, productId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .update({ ...parsed.data, sla_days: parsed.data.sla_days ?? null, required_fields: requirementsFrom(formData) })
    .eq("id", stageId)
    .select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar el pipeline." };
  revalidatePath(`/productos/${productId}`);
  return { success: "Etapa guardada." };
}

export async function addStage(pipelineId: string, productId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const [{ data: org }, { data: last }] = await Promise.all([
    supabase.rpc("current_org_id"),
    supabase.from("pipeline_stages").select("sort_order").eq("pipeline_id", pipelineId).order("sort_order", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { error } = await supabase.from("pipeline_stages").insert({
    ...parsed.data,
    sla_days: parsed.data.sla_days ?? null,
    required_fields: requirementsFrom(formData),
    organization_id: org,
    pipeline_id: pipelineId,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/productos/${productId}`);
  return { success: "Etapa agregada al final del pipeline." };
}
