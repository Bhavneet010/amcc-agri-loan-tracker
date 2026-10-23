# AMCC Agri Loan Tracker

This installable PWA serves the thirteen AMCC branches from Vercel. Branch users share one link, choose or switch branch freely, and add New or Renewal agricultural loans. Admin login is required for remarks, sanction status, and branch renaming.

## Where the data lives

Loan records, branch names, audit history, and admin login attempt counters live in **Supabase**, in dedicated `amcc_` tables in project `xebnciawqwscifzgrkbu`. Vercel hosts the interface. Public lists load directly from the `amcc-api` Supabase Edge Function; writes and admin session requests pass through same-origin Vercel routes. The older [Sites service](https://amcc-agri-loans.bhavneet.chatgpt.site) now forwards its API to the same Supabase service, so older installed clients also use the new database. GitHub stores source code only.

The Vercel gateway runs in Mumbai (`bom1`). Database operations execute in Seoul (`ap-northeast-2`) alongside the existing Supabase database. Successful saves update the screen from the returned record immediately. Supabase Realtime publishes a minimal revision signal when loans or branches change; browsers refresh their current view, with periodic fallback and reconnect checks. Selected branch and branch names are remembered locally; loan records are never persisted in the browser cache.

Admin sessions retain the existing HttpOnly cookie, password, 30-day lifetime, and renewal behavior. The Supabase function's server environment holds the privileged API key; server-only `amcc_config` holds the existing password hash/salt and session-signing secret. Browser code contains only a publishable key. RLS and grants deny public access to loan storage, audit, login counters, configuration, and mutation RPCs. The shared-link branch access model is implemented by the validated API; this migration does not introduce branch logins.

## Development

Node.js 22.13 or newer is required. Run `npm ci`, then `npm run dev`. The local app uses the same shared data service, so test entries are real records. Run `npm test`, `npm run typecheck`, and `npm run build` before deploying. Pushing to the linked `main` branch deploys to Vercel.

The Supabase function source and SQL migration are in `supabase/`; the shared public connection settings are in `lib/supabase-config.ts`. The function validates its application key and signed admin sessions itself, so its platform JWT check is disabled. It grants no direct database write access to the public key. Database mutations and audit events commit atomically and reject stale versions.

## Migration and recovery

The 23 October 2026 migration preserved all 13 branches, 45 loans, and 193 audit entries, including IDs, borrower names, timestamps, versions, remarks, and compliance. Every persisted field was compared against a final raw D1 snapshot after the legacy API was redirected to a gated Supabase service. D1 remains an intact historical backup; it no longer receives application writes.

Snapshots, import SQL, and credentials stay under ignored `outputs/` or private environment files. `scripts/prepare-amcc-import.mjs` prepares a gated import; it refuses to import while the Supabase API is enabled. After new Supabase writes begin, recovery must reconcile those writes before returning traffic to an older database. Never run an old snapshot import against the live service.
