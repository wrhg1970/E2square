import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const control = "h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
}: ComponentProps<"select"> & { label: string; options: { value: string; label: string }[] }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {/* aria-label: sin esto el nombre accesible incluye el texto de la opción elegida. */}
      <select aria-label={label} className={control} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextareaField({ label, className, ...props }: ComponentProps<"textarea"> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      <textarea className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props} />
    </label>
  );
}
