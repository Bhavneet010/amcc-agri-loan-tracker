# Nirnay Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Link eligible fresh Agriculture applications and remarks across both apps without historical migration or duplicate records.

**Architecture:** Extend the shared Supabase API with a bounded Nirnay link adapter, transactional identity matching/idempotency, app-local workflow metadata, and remark history. Nirnay merges shared rows with existing Firebase rows by permanent identity; Agri remains the canonical application. Both deployment URLs remain unchanged.

**Tech Stack:** Supabase Postgres/Edge Functions, Next.js/React, Nirnay browser ES modules and a Vercel Node gateway.

**Spec:** docs/superpowers/specs/2026-10-23-nirnay-linkage.md

## Global Constraints

- Current pending fresh baseline plus new Agriculture applications only; no status synchronization or historical migration.
- ATS optional in Nirnay; exact amounts stored as paise; Agri administrative permissions retained.
- Snapshots/credentials stay ignored. Both repositories are deployed only after their checks pass.

## Review Focus

- Concurrent or retried creates cannot duplicate records, and uncertain matches cannot silently merge distinct borrowers.
- Firestore baseline duplicates are overlaid once; archived/historical data stays out of baseline import.
- Nirnay cannot update Agri status or bypass signed-session checks for remarks.
- Sanction/cleanup/undo retain shared history and identities.
- Lakhs display, reconnects, and stale responses cannot lose exact amounts or resurrect duplicate rows.

## Task 1: Shared service

- [x] Write failing tests for identity matching, request idempotency, optional ATS, scope, independent status, and protected remarks.
- [x] Add a migration for eligibility, links, remark events, nullable ATS and service-only transactional RPCs.
- [x] Implement validated linkage handlers/storage, integrate eligible Agri creates and admin remarks, and verify SQL security/concurrency.

## Task 2: Both clients

- [x] Add Nirnay pure mapping/merge tests, then the shared API adapter and same-origin gateway.
- [x] Route eligible create/edit/read, duplicate confirmation, remark authentication, and polling/Realtime through the shared adapter.
- [x] Update cleanup/delete/undo and show retained remarks and ATS-pending records in Agri.
- [x] Run Nirnay's full tests and syntax checks, Agri tests/typecheck/build, and independent review.

## Task 3: Link and deploy

- [x] Re-read and back up current pending records in both services; link exact matches, hold uncertain matches for explicit review, and verify history untouched.
- [x] Deploy the shared service and both verified repositories; run cross-app browser/API scenarios with isolated synthetic records and clean them up.
- [x] Verify production linkage counts, no duplicate displayed applications, retained historic data, and both deployed commits; record results.

## Verified production result

- Supabase `amcc-api` version 6 serves the shared linkage; all three SQL migrations are applied.
- Agri implementation `d8e3a44` and Nirnay implementation `5931f61` are deployed at their existing URLs. Nirnay region adjustment `4492d9c` runs its gateway in Mumbai, matching Agri.
- 32 Agri tests, typecheck and production build pass. All 86 Nirnay tests and JavaScript syntax checks pass. Independent review has no remaining material findings.
- Live browser/API tests pass for both creation directions, a full Nirnay form create without ATS, protected remark saves, two-way remark propagation/history, exact paise, ATS completion, independent workflow status after Agri sanction, stale-update rejection, request retries, candidate confirmation, and archive/relink restoration.
- Synthetic loans, audit/link/history/request rows and generated synthetic notifications were removed. The final original baseline is 45 Agri loans, 193 audit entries and 1,076,640,000 paise, with four shared applications and three existing Firebase mappings. Every mapped Firebase identity appears once; historical applications and original Firestore loan documents remain intact.
- Shared tables and mutation RPCs reject public-role access. The admin password remains private; snapshots and verification scripts remain ignored.
