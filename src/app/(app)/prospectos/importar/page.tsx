import Link from "next/link";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS } from "@/modules/leads/import-parse";
import { importLeads } from "@/modules/leads/import-action";
import { ImportForm } from "@/modules/institutions/import-form";

export default async function ImportLeadsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("id, name").eq("active", true).order("name");

  return (
    <div className="max-w-4xl space-y-6">
      <div className="on-band page-header space-y-1">
        <Link href="/prospectos" className="text-sm text-muted-foreground underline">Prospectos</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Importar prospectos</h1>
      </div>

      <ol className="grid gap-3 text-sm sm:grid-cols-3" aria-label="Cómo funciona">
        {[
          ["Pega la liga", "De la hoja donde llegan tus leads de Meta, o sube el Excel."],
          ["Revisa", "Te decimos qué filas están listas y cuáles ya estaban. No se guarda nada."],
          ["Importa", "Puedes repetirlo cuando lleguen más: los que ya entraron se omiten."],
        ].map(([title, text], i) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
            <span><span className="block font-semibold">{title}</span><span className="text-muted-foreground">{text}</span></span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="columnas" className="rounded-xl border border-border bg-background p-5 text-sm shadow-sm">
        <h2 id="columnas" className="font-semibold">Qué columnas leemos</h2>
        <p className="mt-1 text-muted-foreground">
          Obligatorios: <strong className="text-foreground">nombre</strong> y <strong className="text-foreground">correo o teléfono</strong>.
          Un prospecto ya importado (mismo Lead ID o mismo correo) no se vuelve a importar. La columna sin encabezado al final se guarda como notas.
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {Object.keys(LEAD_COLUMNS).map((c) => <li key={c} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{c}</li>)}
        </ul>
      </section>

      <ImportForm action={importLeads} noun="prospectos">
        <SelectField label="Producto que les interesa (opcional)" name="product_id" className="sm:max-w-sm"
          options={[{ value: "", label: "Sin producto" }, ...(products ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
      </ImportForm>
    </div>
  );
}
