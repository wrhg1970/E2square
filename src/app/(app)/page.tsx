import { redirect } from "next/navigation";

// shortcut: el inicio lleva a Mi día hasta que exista el dashboard por rol (Fase 5).
export default function Home() {
  redirect("/mi-dia");
}
