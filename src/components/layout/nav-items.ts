import { Briefcase, Building2, CalendarCheck, Home, Package, Settings, Users } from "lucide-react";

// Solo módulos del MVP de enero 2027. `ready` se activa al terminar cada fase.
export const navItems = [
  { href: "/", label: "Inicio", icon: Home, ready: true },
  { href: "/instituciones", label: "Instituciones", icon: Building2, ready: false },
  { href: "/contactos", label: "Contactos", icon: Users, ready: false },
  { href: "/oportunidades", label: "Oportunidades", icon: Briefcase, ready: false },
  { href: "/productos", label: "Productos", icon: Package, ready: false },
  { href: "/mi-dia", label: "Mi día", icon: CalendarCheck, ready: false },
  { href: "/administracion", label: "Administración", icon: Settings, ready: true },
] as const;
