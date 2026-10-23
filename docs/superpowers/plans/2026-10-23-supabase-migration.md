# Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Move the Agri app to its owner's existing Supabase project, preserve data and access rules, and deploy faster shared updates.

**Architecture:** Dedicated amcc-prefixed tables and an Edge Function implement the existing API. Vercel retains same-origin cookie and mutation gateways; a minimal Realtime revision signal and mutation responses update the UI. The previous Sites API forwards to Supabase after a gated final import, preventing split writes.

**Tech Stack:** Next.js 16.3.4, React 19.2.6, TypeScript, Supabase Postgres/Edge Functions/Realtime.

**Spec:** docs/superpowers/specs/2026-10-23-supabase-migration-design.md

## Global Constraints

- Existing project xebnciawqwscifzgrkbu; unrelated tables stay unchanged.
- Preserve 13 branches, all current loans/audit entries, optimistic versions, admin password and sessions.
- No service credentials or borrower snapshots in GitHub/browser bundles.
- Production deployment and migration are explicitly authorized.

## Review Focus

- Overlapping edits: exactly one writer wins and only it produces an audit event.
- Admin fields and sanctioned loans remain protected against anonymous mutation.
- Export/import completeness includes raw sanctioned metadata and borrower names.
- Realtime disconnection and out-of-order reads cannot erase successful saves.
- Old installed clients and the Sites URL must not keep writing to D1 after cutover.

## Task 1: Transactional Supabase service

**Files:** supabase/functions/amcc-api/{index.ts,handler.ts,validation.ts,auth.ts,deno.json}; supabase/migrations/; tests/service.test.ts; tests/auth.test.ts.

- [ ] Write and run failing API/authorization tests using an injectable database adapter.
- [ ] Implement the existing API contract, validated mutations, cookies, rate limiting, and errors.
- [ ] Create dedicated tables, constraints, service-only mutation RPCs, RLS, and revision triggers.
- [ ] Deploy the initially gated function; verify service RPCs and denial of public privileged access.

## Task 2: Prompt client updates

**Files:** lib/{types.ts,proxy.ts,realtime.ts,loan-state.ts}; app/components/{Workspace.tsx,LoanForm.tsx}; tests/{proxy,format,loan-state}.test.ts.

- [ ] Add failing tests for Supabase routing and version-aware immediate state updates.
- [ ] Route public reads to Supabase and cookie/mutation calls through Vercel.
- [ ] Return saved records to Workspace immediately; subscribe to revision changes with fallback polling and request cancellation.
- [ ] Run npm test, npm run typecheck, npm run build; browser-check the app.

## Task 3: Data migration and old-client bridge

**Files:** scripts/migration helpers; ignored outputs/migration-backups/; separate Sites source checkout API routes.

- [ ] Validate existing admin configuration and preserve it in server-only Supabase configuration.
- [ ] Publish Sites API forwarding to the gated Supabase endpoint to stop D1 writes.
- [ ] Export every raw table through Sites pagination; reject omitted/truncated data.
- [ ] Import transactionally and compare every field, IDs, totals, versions, and audit rows.
- [ ] Enable the new API; verify both legacy and Vercel clients use it.

## Task 4: Production verification and delivery

- [ ] Review the complete change; fix important findings and rerun affected checks.
- [ ] Commit/push the verified code, merge into main, and confirm the linked Vercel deployment is ready.
- [ ] Verify production create/edit/compliance/sanction/delete and login, clean up synthetic records, and verify two-client Realtime.
- [ ] Confirm data totals and unrelated Supabase tables; report measured timings and remaining limits.
