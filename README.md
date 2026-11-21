# E2Square CRM — Institutional Growth Platform

Paquete inicial de producto y desarrollo para construir un CRM B2B multiempresa, multiproducto y global.

## Objetivo
Centralizar la gestión comercial de instituciones, contactos, oportunidades, actividades, campañas, comunicaciones, documentos, metas, comisiones e inteligencia comercial.

## Decisiones confirmadas
- Usuarios: toda la organización; 20–30 usuarios iniciales.
- Clientes: colegios, universidades, grupos educativos, empresas, asociaciones y otras organizaciones.
- Estructura: empresa principal con capacidad de incorporar otras empresas.
- Asignación: combinación de vendedor, oficina y territorio.
- Productos iniciales: IHS, Centro de Idiomas Digital, E-Sports, Xplore Together, Arukay, Evaluaciones y TOEFL.
- Una institución puede tener múltiples contactos y oportunidades simultáneas.
- Pipeline configurable por producto.
- Venta: directa, comisión, licencia/suscripción y combinaciones.
- Oportunidades: monto, volumen, precio, moneda, costo, margen, probabilidad y fecha de cierre.
- Metas e incentivos: sí; comisiones configurables y sujetas a aprobación/pago.
- Integraciones: Google Workspace/Gmail, Google Calendar, WhatsApp Business, Excel y sistemas propios.
- Alcance: global, multimoneda y multiidioma.
- Roles: administrador, dirección general, director comercial, gerente de oficina, vendedor, marketing y consulta.
- Importación Excel con detección de duplicados.
- UX: minimalista, moderna y ejecutiva.
- Marca: E2Square.
- Desarrollo: Windows + Claude Code + GitHub privado; no usar VS Code; no desplegar ni realizar cambios destructivos sin autorización expresa.

## Cómo usar este paquete
1. Crear un repositorio privado llamado `e2square-crm`.
2. Copiar todos los archivos de este paquete a la raíz del repositorio.
3. Abrir Claude Code desde la carpeta del repositorio.
4. Leer `CLAUDE.md`.
5. Ejecutar el prompt de inicio incluido al final de `ROADMAP.md`.
6. Trabajar por entregas; no avanzar sin pruebas y aceptación de la fase anterior.

## Estado
Este paquete es una base funcional y técnica inicial. Las reglas comerciales específicas, tarifas, territorios, comisiones y pipelines deberán parametrizarse con datos reales antes de producción.

## Desarrollo local (Windows PowerShell)
Requisitos: Node.js 22+, Docker Desktop (para Supabase local) y Git.

```powershell
npm install
Copy-Item .env.example .env.local
npx supabase start        # imprime la URL y la anon key; cópialas a .env.local
npx supabase db reset     # aplica migraciones y seed
npm run dev               # http://localhost:3000
```

Controles antes de cada entrega: `npm run check` (lint + typecheck + pruebas).

## Primer administrador (proyecto de Supabase remoto)
1. Aplica las migraciones al proyecto remoto (el CLI usa el stack local si no pasas `--remote`):
   ```powershell
   npx supabase login
   npx supabase link --project-ref rechaurextrdspfofeli
   npx supabase db push --remote
   ```
   Te pedirá la contraseña de la base (Supabase > Project Settings > Database). Repite solo `db push --remote` cada vez que se mergee una fase con migraciones nuevas.
2. En el SQL Editor de Supabase ejecuta una sola vez (con tu correo):
   ```sql
   select public.bootstrap_organization('E2Square', 'e2square', 'tu-correo@dominio.com');
   ```
3. En Authentication > Users usa **Add user > Create new user** con ese mismo correo, una contraseña temporal y *Auto Confirm User* activado. Después entra a la app, usa **¿Olvidaste tu contraseña?** y define tu contraseña definitiva. Quedas como Administrador. El orden de los pasos 2 y 3 no importa: si el usuario ya existía, la invitación lo liga al momento (igual para usuarios que invites después desde Administración).
4. En Authentication > Sign In / Providers desactiva **Allow new users to sign up** (solo se entra por invitación).
5. En Authentication > URL Configuration agrega `http://localhost:3000/auth/callback` (y la URL de producción cuando exista) a Redirect URLs.

Los siguientes usuarios: regístralos en Administración > Invitaciones con su rol, créalos en Supabase igual que en el paso 3 y pídeles que definan su contraseña con **¿Olvidaste tu contraseña?**.

## Publicar para el piloto (Vercel)
Se usa la misma cuenta de Vercel de los otros proyectos (LetsGo, DLX-IHS).
1. Vercel > **Add New… > Project** > importa `wrhg1970/E2square` (framework: Next.js, sin cambiar comandos).
2. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL` (`https://rechaurextrdspfofeli.supabase.co`) y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la llave anon/publishable de Supabase > Project Settings > API). Nunca la service_role.
3. **Deploy**. Cada merge a `main` se publica solo; cada PR tiene su vista previa.
4. En Supabase > Authentication > URL Configuration: **Site URL** = la URL de Vercel (por ejemplo `https://e2square.vercel.app`) y en **Redirect URLs** agrega `https://e2square.vercel.app/auth/callback` (y `https://*-wrhg1970-1343s-projects.vercel.app/auth/callback` si quieres probar recuperación de contraseña en las vistas previas). Sin esto, el correo de "olvidé mi contraseña" manda a localhost.
5. Antes de cada publicación con migraciones nuevas: `npx supabase db push --remote`.
6. En Supabase > Project Settings > **Data API**, revisa que **Exposed schemas** incluya `public` (y `graphql_public`). Si queda vacío, el API no arranca (log de Postgres: `schema "pg_pgrst_no_exposed_schemas" does not exist`; en la app: error PGRST002 y "Sin acceso todavía" aunque el perfil esté bien).
7. Correo (recuperar contraseña): el SMTP de fábrica de Supabase solo envía a miembros del equipo de Supabase. Configura SMTP propio en Authentication > Emails > SMTP Settings (Google Workspace: `smtp.gmail.com`, puerto 465, usuario de la cuenta y una contraseña de aplicación) y sube el límite en Authentication > Rate Limits.

## Google Workspace (Gmail y Calendar)
App OAuth **interna** del Workspace (sirve para todos los dominios de la misma organización, sin revisión de Google).
1. https://console.cloud.google.com → nuevo proyecto "E2Square CRM".
2. APIs y servicios → Biblioteca: habilitar **Gmail API** y **Google Calendar API**.
3. Google Auth Platform → Branding (nombre y correo de soporte) → Público: **Interno** → Acceso a datos: `openid`, `email`, `gmail.readonly`, `calendar.events`.
4. Clientes → Crear cliente → Aplicación web, con URIs de redirección `https://e2square.vercel.app/api/google/callback` y `http://localhost:3000/api/google/callback`.
5. En Vercel (Settings → Environment Variables) y en `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_TOKEN_KEY`. La llave se genera en PowerShell con:
   `$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`
6. Redeploy en Vercel. Cada usuario conecta su cuenta en **Integraciones**.

Se guarda solo remitente, destinatarios, asunto, fecha y extracto de los correos con contactos del CRM. El refresh token se cifra con AES-256-GCM antes de llegar a la base, y nadie (ni el admin) lee la conexión de otro usuario.

## Inteligencia artificial (Gemini o Claude)

La IA es opcional y se activa solo en el servidor. Mientras no esté configurada, la app funciona igual y muestra "pendiente".
La licencia de Gemini en Google Workspace no da acceso para aplicaciones: se necesita una clave de API propia.

1. Crea la clave:
   - Gemini: https://aistudio.google.com/apikey
   - Claude: https://console.anthropic.com/settings/keys
2. En Vercel › e2square › Settings › Environment Variables agrega, para Production y Preview:
   - `AI_PROVIDER` = `gemini` (o `anthropic`)
   - `GEMINI_API_KEY` (o `ANTHROPIC_API_KEY`) = la clave
   - Opcional: `AI_MODEL` para usar otro modelo (por defecto `gemini-2.5-flash` o `claude-opus-5-5`).
3. Vuelve a desplegar (Deployments › Redeploy). En Integraciones debe decir "Activa".

Cambiar de proveedor es cambiar esas variables; no hay que tocar código. La IA solo recibe los datos de la oportunidad que el usuario ya puede ver, se ejecuta cuando alguien la pide y no guarda nada. Cada consulta tiene un costo pequeño por uso con el proveedor.

## Pruebas de base de datos
Pruebas E2E en navegador (Playwright) contra Supabase **local**, nunca contra el remoto:
```powershell
npx supabase start; npx supabase db reset
npx playwright install chromium        # solo la primera vez
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role de npx supabase status>"
npm run e2e
```
Recorren login, alta de institución con contacto, aviso de duplicados, oportunidad con productos, actividad, cierre ganado, dashboard, exportación CSV y cierre de sesión. Tu `.env.local` debe apuntar al Supabase local mientras corren.

`npx supabase test db` corre las pruebas pgTAP de `supabase/tests` (aislamiento entre organizaciones, permisos y auditoría).
