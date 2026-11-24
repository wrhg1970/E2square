"use client";
import { useEffect } from "react";

// Guarda la última vista del calendario para abrirlo igual la próxima vez.
export function RememberView({ view }: { view: string }) {
  useEffect(() => {
    document.cookie = `cal_vista=${view}; path=/calendario; max-age=31536000; samesite=lax`;
  }, [view]);
  return null;
}
