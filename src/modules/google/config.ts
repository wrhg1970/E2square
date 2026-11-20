import { z } from "zod";

// Variables de servidor (nunca NEXT_PUBLIC_): sin ellas la integración se muestra como "no configurada".
const schema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(10),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  GOOGLE_TOKEN_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "Debe ser una llave base64 de 32 bytes"),
});

export type GoogleEnv = z.infer<typeof schema>;

export function googleEnv(): GoogleEnv | null {
  const r = schema.safeParse(process.env);
  return r.success ? r.data : null;
}

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];
