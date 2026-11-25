import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const base = "w-full rounded-md border border-border bg-background text-sm shadow-sm transition-colors placeholder:text-muted-foreground/80 hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50";
const control = `${base} h-9 px-3`;

export function Field({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      <input className={control} {...props} />
    </label>
  );
}

export function SelectField({
  label,
  options,
  className,
  ...props
}: ComponentProps<"select"> & { label: string; options: { value: string; label: string; group?: string }[] }) {
  // Con `group`, las opciones se agrupan (optgroup) en el orden en que llegan.
  const groups = [...new Set(options.map((o) => o.group))];
  const render = (list: typeof options) => list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {/* aria-label: sin esto el nombre accesible incluye el texto de la opción elegida. */}
      <select aria-label={label} className={control} {...props}>
        {groups.map((g) =>
          g === undefined ? render(options.filter((o) => o.group === undefined)) : (
            <optgroup key={g} label={g}>{render(options.filter((o) => o.group === g))}</optgroup>
          ),
        )}
      </select>
    </label>
  );
}

export function TextareaField({ label, className, ...props }: ComponentProps<"textarea"> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      <textarea className={`${base} min-h-20 px-3 py-2`} {...props} />
    </label>
  );
}
