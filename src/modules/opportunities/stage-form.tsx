import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { changeStage } from "./actions";

// Mover de etapa: pide el motivo solo si alguna etapa lo puede exigir.
export function StageForm({
  opportunityId,
  stageId,
  stages,
  compact = false,
}: {
  opportunityId: string;
  stageId: string;
  stages: { id: string; name: string; is_lost: boolean; required_fields: string[] }[];
  compact?: boolean;
}) {
  const needsReason = stages.some((s) => s.is_lost || s.required_fields.includes("loss_reason"));
  return (
    <ActionForm
      action={changeStage.bind(null, opportunityId)}
      submitLabel="Mover"
      className={compact ? "flex flex-col gap-2" : "grid gap-3 sm:grid-cols-3 sm:items-end"}
    >
      <SelectField label="Etapa" name="stage_id" defaultValue={stageId} options={stages.map((s) => ({ value: s.id, label: s.name }))} />
      {needsReason && !compact && <Field label="Motivo de pérdida (si aplica)" name="loss_reason" />}
    </ActionForm>
  );
}
