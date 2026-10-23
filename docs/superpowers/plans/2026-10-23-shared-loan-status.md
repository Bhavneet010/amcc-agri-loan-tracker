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

- [ ] Back up current linked data and the verified the reported borrower Firebase document; attach only that identity and adopt its existing Returned decision transactionally.
- [ ] Deploy service and both main branches, verify live bidirectional decisions, authentication, duplicates and the reported borrower's single returned view, then clean synthetic records.
- [ ] Record final data integrity and deployment evidence.
