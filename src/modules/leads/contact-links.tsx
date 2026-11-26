import { Mail, MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { phoneDigits } from "./labels";

// Botones para escribir o llamar al prospecto; `labels` muestra el texto junto al ícono.
export function ContactLinks({ email, phone, country, name, labels = false }: { email: string | null; phone: string | null; country?: string | null; name: string; labels?: boolean }) {
  const cls = buttonVariants({ variant: "outline", size: labels ? "sm" : "icon" }) + (labels ? "" : " size-8");
  const d = phone ? phoneDigits(phone, country) : "";
  return (
    <span className="flex gap-1.5">
      {phone && <a href={`https://wa.me/${d}`} target="_blank" rel="noreferrer" className={cls} aria-label={`WhatsApp a ${name}`} title="WhatsApp"><MessageCircle aria-hidden className="size-4 text-teal-700" />{labels && "WhatsApp"}</a>}
      {phone && <a href={`tel:+${d}`} className={cls} aria-label={`Llamar a ${name}`} title="Llamar"><Phone aria-hidden className="size-4" />{labels && "Llamar"}</a>}
      {email && <a href={`mailto:${email}`} className={cls} aria-label={`Correo a ${name}`} title="Correo"><Mail aria-hidden className="size-4" />{labels && "Correo"}</a>}
    </span>
  );
}
