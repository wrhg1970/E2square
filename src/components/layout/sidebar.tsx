"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/modules/auth/actions";
import { navItems } from "./nav-items";

function NavLinks({ alerts }: { alerts: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1 px-3">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("nav-link flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted font-semibold text-foreground")}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === "/mi-dia" && alerts > 0 && (
              <span className="ml-auto rounded-full bg-amber-400 px-2 text-xs font-semibold text-black" aria-label={`${alerts} pendientes para hoy o vencidas`}>
                {alerts}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Account({ userName }: { userName: string }) {
  return (
    <div className="border-t border-border px-5 py-4 text-sm">
      <p className="truncate font-medium">{userName}</p>
      <form action={signOut}>
        <button type="submit" className="mt-1 text-muted-foreground underline hover:text-foreground">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

export function BrandMark() {
  return <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-extrabold text-primary-foreground">E2</span>;
}

// alerts: actividades pendientes de hoy o vencidas (recordatorio visible en todas las páginas).
export function Sidebar({ userName, alerts = 0 }: { userName: string; alerts?: number }) {
  return (
    <>
      <details className="on-band border-b border-border bg-band md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 font-bold tracking-tight">
          <span className="flex items-center gap-2.5"><BrandMark />E2Square</span>
          <span className="text-sm font-normal text-muted-foreground">Menú{alerts > 0 ? ` · ${alerts} pendientes` : ""}</span>
        </summary>
        <div className="pb-2">
          <NavLinks alerts={alerts} />
          <Account userName={userName} />
        </div>
      </details>
      <aside className="on-band hidden w-60 shrink-0 flex-col bg-band md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5 text-lg font-bold tracking-tight">
          <BrandMark />
          E2Square
        </div>
        <NavLinks alerts={alerts} />
        <div className="mt-auto"><Account userName={userName} /></div>
      </aside>
    </>
  );
}
