# AMCC Agri Loan Tracker

A shared, installable application for thirteen branches. One public link allows unrestricted branch selection; only admin remarks, sanction status and branch renaming require a password.

## Use
Select a branch on the first visit. The app remembers it on that device. Add an ATS number and amount under New loans or Renewals. Mark remarks complied with after completing the requested action. Settings switches branches. Admin access opens the all-branch review workspace.

Branch names start as Branch 01–13 and can be renamed by admin. Data is shared through Cloudflare D1. Internet is required to read or save applications. The service worker provides an offline reconnect screen without caching loan data.

## Admin
A unique generated password is in the ignored local file `outputs/admin-access.txt`. Never share it with branch users. Server secrets are ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET. Password hashing uses PBKDF2-SHA256 with 100,000 iterations. Sessions expire after eight hours; logout clears the cookie. To rotate the password, run `node scripts/setup-admin.mjs`, configure the three resulting values as server secrets, and redeploy. This invalidates existing sessions. Do not run this script casually against an existing deployment.

## Local development
Node.js 22.13 or newer is required. Install using the Sites install helper. Run `node scripts/run-framework.mjs dev` for the loopback preview. Generate schema-only migrations with `node node_modules/drizzle-kit/bin.cjs generate`. Build using the Sites build helper. Apply generated SQL to the local D1 binding using Wrangler's local D1 execute operation and the generated `dist/server/wrangler.json` config. Hosted migrations are applied by Sites during deployment.

## Verification
`node --test tests/*.test.ts` checks validation, database operations, concurrency and admin authentication. `node node_modules/typescript/bin/tsc --noEmit` checks types. Browser and live API checks exercise the complete workflows.
