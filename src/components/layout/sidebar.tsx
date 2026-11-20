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
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted", active && "bg-muted font-medium")}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === "/mi-dia" && alerts > 0 && (
              <span className="ml-auto rounded-full bg-red-700 px-2 text-xs font-medium text-white" aria-label={`${alerts} pendientes para hoy o vencidas`}>
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

// alerts: actividades pendientes de hoy o vencidas (recordatorio visible en todas las páginas).
export function Sidebar({ userName, alerts = 0 }: { userName: string; alerts?: number }) {
  return (
    <>
      <details className="border-b border-border bg-muted/40 md:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3 font-semibold">
          E2Square
          <span className="text-sm font-normal text-muted-foreground">Menú{alerts > 0 ? ` · ${alerts} pendientes` : ""}</span>
        </summary>
        <div className="pb-2">
          <NavLinks alerts={alerts} />
          <Account userName={userName} />
        </div>
      </details>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
        <div className="px-5 py-5 text-lg font-semibold tracking-tight">E2Square</div>
        <NavLinks alerts={alerts} />
        <div className="mt-auto"><Account userName={userName} /></div>
      </aside>
    </>
  );
}
