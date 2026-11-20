import { createClient } from "@/lib/supabase/server";

// Descarga: si ves el documento (RLS), redirige a una URL firmada que expira en 60 segundos.
export async function GET(_req: Request, { params }: RouteContext<"/documentos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return new Response("Documento no encontrado o sin permiso.", { status: 404 });
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) return new Response("No se pudo generar el enlace.", { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}
