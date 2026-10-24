# Branch notifications implementation plan

> Implement inline using superpowers:executing-plans, with a final independent review.

**Goal:** Show unread loan remarks and decisions in a centered branch popup, acknowledged separately on each phone.

**Architecture:** Transactional notification events and per-installation read receipts in Supabase; a validated edge API; a focused React popup using the existing Modal. No historical backfill.

**Tech stack:** Existing Next.js/React/TypeScript, Supabase Postgres/Edge Functions, Node tests and bundled Playwright.

**Spec:** ../specs/2026-10-24-branch-notifications-design.md (user approved recommended behavior).

**Constraints:** Preserve all user loans and existing workflows. Service-role stays server-only. Notification reads/acknowledgements require no additional password. UUID installation identity persists on each phone. Capture new updates only.

**Review focus:** Cross-branch data, concurrent new events while acknowledging, stale fetches during branch changes, failed acknowledgements/offline storage, more than 50 unread updates and other dialogs.

- [x] Task 1 — Write failing API validation and grouping/device tests in tests/notifications.test.ts. Add lib/notifications.ts for event types, grouping and installation identity. Add edge notifications.ts plus optional Storage methods, handler route, proxy route allowlist and Next notification route. Verify bad IDs/methods, correct scope and acknowledgements.
- [x] Task 2 — In the CLI-generated migration, add service-only event/read tables, meaningful-change trigger, indexed unread feed and explicit-ID acknowledgement RPC. Verify in rollback transactions: remarks and decisions from each app, renewals, no-op/compliance exclusion, independent devices, branch/deletion filtering and batch limits. Existing rows must remain unchanged.
- [x] Task 3 — Add BranchNotifications.tsx, focused notification styles and Workspace integration. Verify browser popup, grouped text, Later/reopen, acknowledgement/reload, separate phones, branch switching, late arrivals, error retry, mobile layout and existing editor behavior.
- [ ] Task 4 — Run complete tests/typecheck/build, independent review, apply migration and deploy edge/frontend to existing production targets. Verify live flow with synthetic records only, remove test data, compare pre-existing records and document evidence.

Ruling: the desktop worktree helper could not resolve this repository's main ref. Use the clean existing checkout on a dedicated codex/ branch; do not change pre-existing AGENTS.md or CLAUDE.md. User authorization covers implementation and deployment.

Verified: 44 Node tests, typecheck and production build passed. Database rollback checks cover renewal remarks, decisions, no-op/compliance exclusion, branch moves, deletion, two independent devices, duplicate acknowledgement, concurrent arrival, 50+3 paging and no public table/RPC grants. Actual Nirnay creation with initial remarks was tested RED then GREEN; subsequent updates still notify. Browser flow passed all fourteen checks, including first-install priority, editor priority, failed acknowledgement retry and late events. Layout verified at 320x568, 390x844 and 1280x900. Final reviewer confirmed both findings resolved with no additional material findings. Edge version 11 is active; frontend deployment and final live cleanup pending.
