/**
 * Test-environment guard. The suite's correctness silently depended on a keyless shell:
 * if Supabase env vars leak in, DATA_MODE flips to "live" and every store-backed test
 * starts issuing real reads AND writes against whatever database those vars point at.
 * Strip the integration env before any module computes DATA_MODE.
 */
for (const key of Object.keys(process.env)) {
  if (
    key.startsWith("NEXT_PUBLIC_SUPABASE") ||
    key === "SUPABASE_SERVICE_ROLE_KEY" ||
    key.endsWith("_API_KEY") ||
    key.endsWith("_AUTH_TOKEN") ||
    key.startsWith("ZOHO_") ||
    key.startsWith("TWILIO_") ||
    key.startsWith("GMAIL_") ||
    key.startsWith("TELEGRAM_")
  ) {
    delete process.env[key];
  }
}
