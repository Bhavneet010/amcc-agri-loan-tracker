# AMCC Agri Loan Tracker

This installable PWA serves the thirteen AMCC branches from Vercel. Branch users share one link, choose or switch branch freely, and add New or Renewal agricultural loans. Admin login is required for remarks, sanction status, and branch renaming.

## Where the data lives

Loan records, branch names, audit history, and admin login attempt counters live in **Cloudflare D1**, attached to the [AMCC shared data service](https://amcc-agri-loans.bhavneet.chatgpt.site). Vercel hosts the interface and forwards its `/api` requests to that service through server functions. GitHub stores source code only. The app depends on the shared data service staying available; do not delete or restrict it while this Vercel app is in use.

The API functions run in Vercel's Mumbai region (`bom1`, set in `vercel.json`) to stay close to the branches. The selected branch and the branch names are remembered in browser local storage so the app opens without waiting on the network. Loan records are never stored in the browser cache. Admin sessions use an HttpOnly cookie and an eight-hour expiry. Keep the existing admin password private; it is not committed to this repository or stored in Vercel.

## Development

Node.js 22.13 or newer is required. Run `npm ci`, then `npm run dev`. The local app uses the same shared data service, so test entries are real records. Run `npm test`, `npm run typecheck`, and `npm run build` before deploying. Pushing to the linked `main` branch deploys to Vercel.

The source data service has its own code and D1 migrations, maintained separately. This repository contains the Vercel interface and API gateway. If the data service URL changes, update `DATA_ORIGIN` in `lib/proxy.ts`, verify the API contract, and redeploy.
