import { cn } from "@/lib/utils";

// Logo del proveedor o, si no hay, sus iniciales sobre teal.
export function SupplierLogo({ id, name, logoPath, className }: { id: string; name: string; logoPath: string | null; className?: string }) {
  const box = cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border", className);
  if (logoPath) {
    return (
      <span className={cn(box, "bg-white p-1")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada que cambia; next/image no aporta aquí */}
        <img src={`/productos/${id}/logo?v=${encodeURIComponent(logoPath.slice(-16))}`} alt={`Logo de ${name}`} className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span aria-hidden className={cn(box, "border-primary/30 bg-primary/10 font-semibold text-teal-800")}>{initials}</span>;
}
