"use client";

import { useRef, type ComponentProps } from "react";

// Formulario GET de filtros que se aplica solo: listas y casillas al cambiar; fechas al salir del campo
// (para no recargar a media captura); el texto se aplica con Enter.
export function AutoForm(props: ComponentProps<"form">) {
  const dirty = useRef(false);
  return (
    <form
      {...props}
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (t.tagName === "SELECT" || t.type === "checkbox" || t.type === "radio") e.currentTarget.requestSubmit();
        else if (t.type === "date" || t.type === "month") dirty.current = true;
      }}
      onBlur={(e) => {
        if (dirty.current) { dirty.current = false; e.currentTarget.requestSubmit(); }
      }}
    />
  );
}
