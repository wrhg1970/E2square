import { Briefcase, Building2, CalendarCheck, CalendarDays, Home, Package, Settings, Target, Users } from "lucide-react";

// Módulos del MVP de enero 2027.
export const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/instituciones", label: "Instituciones", icon: Building2 },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/oportunidades", label: "Oportunidades", icon: Briefcase },
  { href: "/productos", label: "Productos", icon: Package },
  { href: "/mi-dia", label: "Mi día", icon: CalendarCheck },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/administracion", label: "Administración", icon: Settings },
] as const;
