# Limited Agri–Nirnay linkage

Approved by the user: current pending fresh Agriculture applications and future fresh Agriculture entries, with shared remarks and duplicate confirmation. Historical sanctioned/returned records, renewals, SME/Education records, and status synchronization are outside this phase.

Agri is the canonical store for shared application identity, borrower, branch, amount, and remarks. Nirnay keeps its own workflow fields and status in a dedicated link record; each linked application has one permanent shared ID. Existing Firestore documents remain intact and are overlaid with their shared record, never duplicated in the displayed list. Nirnay-origin records may have a null ATS; Agri shows ATS pending and can add ATS later without creating another loan. Agri-origin creation continues requiring ATS.

Only the pending fresh baseline and fresh creates after activation are eligible. Baseline matches use branch code, normalized borrower, and exact paise amounts. Possible matches require confirmation; no silent fuzzy merging. Creation is serialized and request IDs are idempotent. Existing identity links always win over heuristic matching, and historical records are not imported merely because their status changes.

Shared remarks retain append-only history with app, author label, time, and request ID. Agri administrative remarks continue to require the existing signed admin session. Nirnay authenticates shared remark changes through a same-origin server gateway using the existing Agri admin password; a browser-selected officer name is attribution, never authorization. Branch access permissions otherwise stay unchanged.

Shared remark history survives sanction and app-local archiving. Nirnay status changes do not alter Agri status. Month-end cleanup and manual delete/undo archive or restore the Nirnay view of linked records; they never delete the canonical Agri application. Direct Firestore workflows must account for linked records.

Nirnay preserves raw paise amounts so opening a form displayed in lakhs cannot round an unchanged amount. Realtime and polling reconcile the combined Nirnay dataset; a shared-service failure must not masquerade as a successful save. No persistent browser loan cache is added. Both apps require an internet connection for shared writes.

Verify both directions of creation and remarks, baseline deduplication, simultaneous create/retries, explicit duplicate confirmation, optional ATS completion, status independence, sanction retention, archive/restore, unit suites, production builds, browser smoke, and deployed routes. Keep snapshots ignored and retain all historical source data.
