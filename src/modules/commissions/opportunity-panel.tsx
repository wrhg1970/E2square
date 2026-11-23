import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/modules/activities/time";
import { addSplit, removeSplit, setCollected } from "./actions";

type Person = { id: string; full_name: string | null; email: string };

// Reparto de comisión (antes de ganar) y pago del cliente (después de ganar) de una oportunidad.
export async function OpportunityCommissionPanel({ opp, meId, people }: {
  opp: { id: string; owner_id: string | null; status: string }; meId: string | null; people: Person[];
}) {
  const supabase = await createClient();
  const [{ data: splits }, { data: collection }, { data: canManage }, { data: canApprove }] = await Promise.all([
    supabase.from("opportunity_splits").select("id, profile_id, share_pct").eq("opportunity_id", opp.id).order("created_at"),
    supabase.from("opportunity_collections").select("collected_on").eq("opportunity_id", opp.id).maybeSingle(),
    supabase.rpc("has_permission", { permission: "commissions.manage" }),
    supabase.rpc("has_permission", { permission: "commissions.approve" }),
  ]);
  const name = new Map(people.map((p) => [p.id, p.full_name || p.email]));
  const ceded = (splits ?? []).reduce((s, x) => s + Number(x.share_pct), 0);
  const canSplit = opp.status === "open" && (canManage || (meId !== null && meId === opp.owner_id));
  const won = opp.status === "won";

  return (
    <div className="space-y-3 text-sm">
      <p>
        {opp.owner_id ? `${name.get(opp.owner_id) ?? "Responsable"}: ${100 - ceded}%` : "Sin responsable"}
        {(splits ?? []).map((s) => (
          <span key={s.id}>
            {" · "}{name.get(s.profile_id) ?? "—"}: {Number(s.share_pct)}%
            {canSplit && (
              <form action={removeSplit.bind(null, opp.id, s.id)} className="inline">
                {" "}<button type="submit" className="text-xs underline">Quitar</button>
              </form>
            )}
          </span>
        ))}
      </p>
      {canSplit && (
        <ActionForm action={addSplit} submitLabel="Compartir comisión" submitVariant="outline" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="opportunity_id" value={opp.id} />
          <SelectField label="Agente" name="profile_id" options={[{ value: "", label: "Elige un agente" },
            ...people.filter((p) => p.id !== opp.owner_id && !(splits ?? []).some((s) => s.profile_id === p.id)).map((p) => ({ value: p.id, label: p.full_name || p.email }))]} />
          <Field label="Porcentaje que se le cede" name="share_pct" type="number" min="1" max="99" step="0.01" required className="w-40" />
        </ActionForm>
      )}
      {won && (
        <div className="flex flex-wrap items-center gap-3">
          <span>{collection ? `El cliente pagó (registrado el ${formatDay(collection.collected_on)}).` : "El cliente aún no ha pagado."}</span>
          {canApprove && (
            <ActionForm action={setCollected.bind(null, opp.id, !collection)} submitLabel={collection ? "Quitar pago del cliente" : "Registrar pago del cliente"}
              submitVariant="outline" className="flex items-center gap-2">{null}</ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
