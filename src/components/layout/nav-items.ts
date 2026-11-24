import { BarChart3, Briefcase, BadgeDollarSign, Plug, Building2, CalendarCheck, CalendarDays, FileText, Home, Mail, Megaphone, Package, Settings, Target, Users } from "lucide-react";

// Módulos del MVP de enero 2027.
export const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/instituciones", label: "Instituciones", icon: Building2 },
  { href: "/contactos", label: "Contactos", icon: Users },
  { href: "/oportunidades", label: "Oportunidades", icon: Briefcase },
  { href: "/productos", label: "Proveedores", icon: Package },
  { href: "/campanas", label: "Campañas", icon: Megaphone },
  { href: "/correos", label: "Correos", icon: Mail },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/mi-dia", label: "Mi día", icon: CalendarCheck },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/consultas", label: "Consultas", icon: BarChart3 },
  { href: "/comisiones", label: "Comisiones", icon: BadgeDollarSign },
  { href: "/integraciones", label: "Integraciones", icon: Plug },
  { href: "/administracion", label: "Administración", icon: Settings },
] as const;
