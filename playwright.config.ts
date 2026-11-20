import { defineConfig } from "@playwright/test";

// E2E contra Supabase LOCAL (npx supabase start + db reset). Nunca contra el proyecto remoto.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3000", locale: "es-MX", timezoneId: "America/Mexico_City", trace: "off" },
  webServer: { command: "npm run build && npm run start", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 240_000 },
});
