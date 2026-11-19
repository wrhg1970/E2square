"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/modules/auth/actions";
import { navItems } from "./nav-items";

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/40 md:flex">
      <div className="px-5 py-5 text-lg font-semibold tracking-tight">E2Square</div>
      <nav aria-label="Principal" className="flex flex-col gap-1 px-3">
        {navItems.map(({ href, label, icon: Icon, ready }) =>
          ready ? (
            <Link
              key={href}
              href={href}
              aria-current={(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted",
                (href === "/" ? pathname === "/" : pathname.startsWith(href)) && "bg-muted font-medium",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ) : (
            <span key={href} aria-disabled className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
              <Icon className="size-4" aria-hidden />
              {label}
              <span className="ml-auto text-xs">Pronto</span>
            </span>
          ),
        )}
      </nav>
      <div className="mt-auto border-t border-border px-5 py-4 text-sm">
        <p className="truncate font-medium">{userName}</p>
        <form action={signOut}>
          <button type="submit" className="mt-1 text-muted-foreground underline hover:text-foreground">
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
