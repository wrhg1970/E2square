import { createClient } from "@/lib/supabase/server";

// Logo del proveedor: si lo ves (RLS), redirige a una URL firmada de una hora; el navegador la guarda en caché.
export async function GET(_req: Request, { params }: RouteContext<"/productos/[id]/logo">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("products").select("logo_path").eq("id", id).maybeSingle();
  if (!p?.logo_path) return new Response("Sin logo.", { status: 404 });
  const { data, error } = await supabase.storage.from("logos").createSignedUrl(p.logo_path, 3600);
  if (error || !data) return new Response("No se pudo cargar el logo.", { status: 500 });
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" } });
}
