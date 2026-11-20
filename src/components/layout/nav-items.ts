import { Briefcase, Building2, CalendarCheck, Home, Package, Settings, Users } from "lucide-react";

// Solo módulos del MVP de enero 2027. `ready` se activa al terminar cada fase.
export const navItems = [
  { href: "/", label: "Inicio", icon: Home, ready: true },
  { href: "/instituciones", label: "Instituciones", icon: Building2, ready: true },
  { href: "/contactos", label: "Contactos", icon: Users, ready: true },
  { href: "/oportunidades", label: "Oportunidades", icon: Briefcase, ready: true },
  { href: "/productos", label: "Productos", icon: Package, ready: true },
  { href: "/mi-dia", label: "Mi día", icon: CalendarCheck, ready: false },
  { href: "/administracion", label: "Administración", icon: Settings, ready: true },
] as const;
