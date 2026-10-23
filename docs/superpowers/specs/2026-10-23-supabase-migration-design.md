# Agri tracker Supabase migration

Status: approved by the user on 23 October 2026, including implementation, migration, and deployment. The user selected the existing Supabase project with separate Agri tables.

## Outcome

Keep the current Agri tracker URL and branch/admin workflows. Move its shared data service from Cloudflare D1 to Supabase project `xebnciawqwscifzgrkbu` in the connected account. Display successful saves immediately and notify other open devices through Supabase Realtime instead of relying on the current 20-second polling interval.

## Evidence

- GitHub repository `Bhavneet010/amcc-agri-loan-tracker` exists and is private. The local Vercel checkout tracks its `main` branch at `ea5b2e9`.
- Current production API contains 13 branches and 45 loans at inspection time. Recount before cutover.
- One measurement returned loans directly from the current data service in 533 ms and through Vercel in 5293 ms; a branch request took 4786 ms. These are individual observations, not a performance guarantee or a controlled benchmark.
- The current client polls every 20 seconds, and after saving it waits for a separate list request to display the saved record.
- The user's other repository, `Bhavneet010/Loan-Tracker`, uses Firebase. Its existing code and database are outside this migration.
- The selected Supabase project is in Seoul and contains unrelated finance tables. Geographic latency remains a constraint; this migration will not move that project to India.

## Architecture

1. Add dedicated `amcc_branches`, `amcc_loans`, `amcc_audit`, and `amcc_login_attempts` tables. Preserve IDs, names, borrower names, integer paise amounts, category, status, remarks, compliance, timestamps, and record versions. Retain branch/category/ATS uniqueness and optimistic concurrency checks.
2. Implement the data API as a dedicated Supabase Edge Function. Its server environment supplies privileged database credentials. Keep these credentials out of the browser and GitHub. Keep admin configuration inaccessible to public roles and preserve the existing password/session behavior after validating the current configuration.
3. Continue using Vercel routes for admin cookies and same-origin mutations, with Supabase as their upstream. Public list requests may call the Supabase API directly, as they currently call the D1 service directly. Preserve the current shared-link branch access model and admin restrictions.
4. Enable RLS and least-privilege grants on every new public-schema table. Protect audit, login counters, and admin configuration from public access. Use transactions for record changes and their audit events.
5. Publish only a minimal revision signal through an `amcc_changes` table for Realtime. A database trigger updates this signal when branches or loans change; clients reload their current view. This avoids exposing audit or credential data through subscriptions and also covers deletions.
6. Apply the server-returned saved/deleted record to the current screen immediately. Keep background reconciliation, reconnect refresh, cancellation of superseded requests, and a slow polling fallback if Realtime is unavailable. Keep loan data out of persistent browser caches.

## Data transfer and cutover

Back up the live D1 tables through the Sites database reader, including audit rows, using its pagination cursors. Keep backups under ignored `outputs/migration-backups/`; never commit loan records or credentials. Reject truncated pages or values during export. Import into the dedicated Supabase tables and compare IDs, every persisted field, total amounts, per-branch counts, versions, and audit records.

Do not assume a public API snapshot is sufficient: it masks remarks/compliance on sanctioned loans and omits audit history. Use raw D1 rows as the migration source of truth.

Prevent writes during the final export/import window, or implement a verified reconciliation bridge, before switching traffic. Verify the existing Sites UI cannot keep accepting D1 writes unnoticed after the Vercel app switches to Supabase. Recheck the final snapshot before deployment. Leave the D1 data intact as a backup. After Supabase begins receiving writes, switching back requires reconciling those writes first.

## Verification

Run unit tests, TypeScript checks, and a production build. Verify create/edit/delete, branch selection/rename, admin login/logout, sanction/remarks, compliance, duplicate ATS handling, stale-version conflicts, and anonymous access restrictions. Verify one browser sees another browser's update promptly and that a successful save appears without waiting for a full list reload. Compare repeated direct and proxied request timings before claiming a speed improvement. Confirm the deployed application reads/writes Supabase and that unrelated Supabase tables are unchanged.

## Approval

Approve this design to proceed with implementation, migration, and deployment using the existing Supabase project and separate Agri tables. The implementation must not claim completion until production cutover and data verification are confirmed.
