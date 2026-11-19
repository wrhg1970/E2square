"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-muted/40 md:block">
      <div className="px-5 py-5 text-lg font-semibold tracking-tight">E2Square</div>
      <nav aria-label="Principal" className="flex flex-col gap-1 px-3">
        {navItems.map(({ href, label, icon: Icon, ready }) =>
          ready ? (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted",
                pathname === href && "bg-muted font-medium",
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
    </aside>
  );
}
