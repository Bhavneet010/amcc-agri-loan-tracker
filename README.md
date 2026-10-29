# AMCC Agri Loan Tracker

This installable PWA serves the thirteen AMCC branches from Vercel. Branch users share one link, choose or switch branch freely, and add New or Renewal agricultural loans. Admin login is required for remarks, sanction status, and branch renaming.

When a branch opens or returns to the app, **Updates to your loans** shows unread remarks and status changes for that branch, including Nirnay changes to linked applications. Updates are grouped by borrower and ATS and include full remarks, return reasons and change times. **Mark as read** clears the displayed updates only on that phone; **Later** keeps them unread for the next opening. Read state follows a random installation ID retained in site storage, so clearing browser/app storage resets it. Only changes made after this feature was activated are included; initial creation, compliance changes and unchanged saves do not create notifications. Fresh loans and renewals are both covered. Installation instructions and loan editors take priority over the popup.

## New loan alerts on the admin's phone

An admin can open **Admin overview → Branch settings** and choose **Turn on for this phone** under **New loan alerts**. From then on, that phone gets a notification whenever a loan is created, whether it is a new loan or a renewal, from a branch here or from Nirnay. The notification shows the branch, borrower, New/Renewal and amount; tapping it opens the app. Only phones where an admin switched alerts on receive them, and branch users can't register. **Turn off on this phone** or **Sign out of admin** stops alerts on that phone. On Android this works in Chrome, best from the installed app. On an iPhone, it needs iOS 16.4 or later and the app added to the Home Screen.

A database trigger queues an alert in `amcc_push_outbox` in the same transaction that inserts the loan, so request replays and rolled-back saves queue nothing. Attaching an existing Nirnay application is an admin review of an old application, so it does not alert. After replying to the create request, the Edge Function sends queued alerts through standard Web Push (VAPID, encrypted payloads) to the phones in `amcc_push_subscriptions`. Failed sends are retried with the next new loan, for up to a day or five attempts. Phones the push service reports as gone are removed. The function creates the signing key pair on first use and keeps it in the server-only `amcc_push_keys` table. All three tables deny public access. Only loans created after activation alert.

## Renewal charge details

Renewals above ₹2,00,000 must answer **Upload charge details?** with Yes or No before they can be saved; the API enforces this for new renewals and for edits that leave a renewal above the limit. Choosing Yes lets the branch take or choose a photo, which the phone compresses (1600px long side, JPEG, usually under 450 KB) before upload. Images sit in the private `amcc-charge-details` Supabase Storage bucket and the admin and branch view them through five-minute signed links. When the loan is sanctioned or deleted, the API deletes the image file; the Yes/No answer stays in `amcc_charge_details`. Any cleanup that fails is retried the next time the loan is read.

## KCC calculator beta

Open the Settings gear menu and choose **KCC calculator · Beta**. This entry is available in branch and admin views; the calculator has no separate route or homepage shortcut. Inputs stay in memory and are cleared when the calculator closes. It does not create loan records or call the data service.

The FY 2026–27 rates are extracted verbatim from the supplied `KCC CALCULATION - SOF FY 2026-27 UPDATED.xlsx`, `FINAL AGRICULTURE!B1:N176`, with all 175 crop/condition rows and 12 districts retained. The source SHA256 is recorded in `lib/kcc-sof.ts`. Both borrower cultivated land and Scale of Finance use **acres**, as confirmed for this workbook. For each included season, recorded crop areas determine crop shares; those shares allocate the borrower's cultivated acreage. Year 1 is combined Kharif/Rabi crop finance × 1.30; years 2–5 compound at 10% annually. Automated tests reproduce the saved workbook results, including ₹24,747.01 in year 1 and ₹36,232.09 in year 5. The user interface starts with blank inputs.

Crop areas and the borrower land converter accept HP Bigha–Biswa–Biswansi, Kanal–Marla–Sarsahi, Hectare–Are–Centiare, decimal acres/hectares, and square metres. Kanal entries require a confirmed 66-inch or 57.5-inch karam; unknown standards block conversion. The supplied HP desk reference dated 26 October 2026 supplies the conversion relationships. Fixed-size/protected/activity labels are preserved and flagged for review; the beta follows the workbook's confirmed per-acre interpretation rather than silently redefining those rates.

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

## Shared Agriculture applications with Nirnay

The [Nirnay app](https://loan-tracker-xi.vercel.app) shares the four fresh applications pending at activation and future fresh Agriculture applications through the same Supabase service. Existing Nirnay applications are matched by branch, borrower and exact amount; their Firebase documents remain intact and display once. Historical applications and renewals are excluded from bulk linkage. An exact existing Nirnay identity can be explicitly attached after administrator review, including a previously returned application.

Borrower, branch, exact amount and remarks use one permanent shared record. Linked fresh applications use one Pending/Sanctioned/Returned status, return reason/date and sanction date in both apps. Nirnay keeps its own officer assignments and other workflow fields. Shared remarks retain an internal append-only history. Nirnay remarks save without an additional password; changing shared decisions still requires the existing Agri admin password.

Nirnay does not require ATS. Its new applications appear here as **ATS pending** until the branch adds the ATS through the normal edit form. Agri creates still require ATS. Retries reuse a request ID, known ATS prevents duplicate entries, and possible borrower matches require an explicit link or confirmation of a different application. Deleting a linked application removes it from both apps while preserving its identity and internal audit records. Nirnay Undo restores the same application in both apps.

Agri includes a Returned filter and summary count. Returning requires a reason and records a date; an administrator can explicitly resubmit the same application as Pending. Decision and remark events retain history, source and request IDs. Duplicate lookup also checks existing Nirnay Agriculture records in all three statuses. No original Firebase loan document is deleted or rewritten by attachment.
