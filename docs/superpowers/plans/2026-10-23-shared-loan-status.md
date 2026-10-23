# Shared Loan Status Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. The user approved implementation; continue inline with one independent final review.

**Goal:** One protected three-state workflow for shared fresh Agriculture applications, including correction of the reported borrower's returned identity.

**Architecture:** Canonical Postgres status/date/reason and append-only decision events feed both clients. The API verifies existing Firebase candidates before an explicit transactional attachment. Nirnay status metadata becomes a compatibility projection.

**Tech Stack:** Supabase Postgres/Edge Functions, Next.js/React, Nirnay browser modules and Vercel gateways.

**Spec:** docs/superpowers/specs/2026-10-23-shared-loan-status.md

## Constraints and review focus

- Only eligible fresh Agriculture decisions synchronize; preserve historical and renewal workflows and all original Firestore loan documents.
- Signed admin authentication for status/reason/date changes; version checks prevent stale edits.
- A returned application never silently becomes pending; request retries never reapply an old decision.
- Existing candidates in all statuses require explicit selection, with exact branch/name/amount checks before attachment.
- Both apps preserve reasons, dates and histories across sanction, clear, archive and resubmission.

## Task 1: Canonical workflow and API

- [x] Add failing tests in tests/linkage.test.ts and tests/summary.test.ts for protected shared decisions, return validation and returned counts; run and confirm failures.
- [x] Add a CLI-generated migration for Returned, decision fields/history, canonical Nirnay updates, compatibility projections and transactional identity attachment; test with rollback SQL.
- [x] Add validated API status handling and all-status Firebase candidate checks; retain server-only grants and existing admin cookies.

## Task 2: Both clients

- [x] Add failing Nirnay mapping/matching tests, then project canonical status/date/reason and route returned reasons through existing editors.
- [x] Extend Agri forms, filters, rows and summary with Returned; preserve readable decision history and admin-only resubmission.
- [x] Run both full test suites, syntax/type/build checks and independent review; fix material findings.

## Task 3: Correct and deploy

- [x] Back up current linked data and the verified the reported borrower Firebase document; attach only that identity and adopt its existing Returned decision transactionally.
- [x] Deploy service and both main branches, verify live bidirectional decisions, authentication, duplicates and the reported borrower's single returned view, then clean synthetic records.
- [x] Record final data integrity and deployment evidence.

## Production verification

- Supabase migration applied; `amcc-api` version 9 is active. Agri implementation `b947bbc` and Nirnay implementation `06883bd` are READY at their existing production URLs.
- Agri: 37 tests, TypeScript check and production build pass. Nirnay: 88 tests and module syntax checks pass. Independent review has no remaining material findings.
- Both local and live browser flows verified Nirnay return with an explicitly selected date, Agri resubmission and sanction, two-way propagation, retained remarks/reasons/history, stale-write rejection and required admin authentication. Mobile 390/320 layouts were inspected.
- The reported existing returned identity is attached once and remains Returned with its original decision date. Its original Firestore document is unchanged; all 44 unrelated Agri records match the pre-change backup.
- Final baseline: 45 loans, 1,076,640,000 paise; four linked fresh applications (three Pending, one Returned), four Firebase mappings, 194 audit entries and one decision event. The added audit/event is the targeted correction. No synthetic loans or synthetic notifications remain.
- Public roles cannot read decision events or execute identity attachment; source snapshots, repair SQL and browser evidence remain ignored.
