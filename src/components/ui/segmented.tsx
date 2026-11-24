import Link from "next/link";

// Filtro de un clic: cada opción es un enlace, sin botón "Filtrar".
export function Segmented({ label, items }: { label: string; items: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-background p-1 text-sm shadow-sm">
      {items.map((i) => (
        <Link key={i.href + i.label} href={i.href} aria-current={i.current ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 ${i.current ? "bg-band font-semibold text-white" : "text-muted-foreground hover:text-foreground"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
