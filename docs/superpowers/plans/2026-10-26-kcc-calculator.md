# KCC Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reproduce the user's KCC workbook inside the Settings menu as a beta calculator.

**Architecture:** A pure TypeScript calculation engine uses a checked-in extraction of the supplied FY 2026–27 SOF table. A lazy-loaded client dialog owns ephemeral input state and uses the existing app's design conventions. It makes no data-service requests.

**Tech Stack:** Existing Next.js 16, React 19, TypeScript, Node test runner, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-10-26-kcc-calculator-design.md`, approved by the user on 26 October 2026.

## Global Constraints

- Settings gear menu only; Beta and FY 2026–27 visible.
- Cultivated land and SOF basis are acres, as explicitly confirmed by the user.
- Year 1 = summed seasonal finance × 1.30; years 2–5 compound at × 1.10.
- All 175 crop/condition rows and all 12 district rates remain intact.
- No database mutations, automatic loan creation, persistence, new dependencies, push or deployment.
- Exact conversion relationships; explicit karam choice for kanal; unknown karam blocks that row.

## Review Focus

- Switching units must not reinterpret an existing area silently: clear that row's area and show an explanation; verify in browser.
- Turning a season off must exclude its drafts; turning it on restores drafts and validation; engine test and browser check.
- Blank, invalid and zero values must not become a healthy zero finance result; engine tests.
- Dialog dismissal and notification/install priority must remain correct; browser check including Escape.
- Worksheet serial numbers repeat; row IDs must be based on source row and stay unique; catalog test.

---

### Task 1: Data and calculation engine

**Files:** Create `lib/kcc-sof.ts`, `lib/kcc.ts`, `tests/kcc.test.ts`; extraction helper stays outside the repo in the workspace outputs directory.

**Interfaces:** `AreaInput { unit, values: [string,string,string], karam }`; `KccInput { district, cultivatedAcres, totalAcres, kharif, rabi }`; each season `{ enabled, rows }`; each row `{ id, cropId, area }`. Export `areaInAcres(area): number`, `calculateKcc(input): KccResult`, `blankKccInput(): KccInput`, `kccWorkbookExample(): KccInput`. Results expose validation errors, per-row allocation, seasonal totals and five annual limits (null when invalid).

- [x] Write behavior tests first: the workbook's exact sample and all five cached annual values, 2–13–10 bigha = 0.535 acre, standard kanal = 0.125 acre, 57.5-inch kanal conversion, metric equivalents, large leading positional values, invalid numeric fields/karam, district-specific rates, empty/zero/disabled seasons and acreage exceeding optional total land.
- [x] Run `node --test tests/kcc.test.ts`; expect failure because the engine is absent.
- [x] Extract the source table with source filename, worksheet range and SHA256 provenance. Add the pure engine, guard missing/nonfinite rates and prevent nonfinite totals.
- [x] Run `npm test`; expect all existing and new behavior tests to pass.

### Task 2: Calculator and Settings entry

**Files:** Create `app/components/KccCalculator.tsx`, `app/components/KccAreaInput.tsx`, `app/components/KccCalculator.module.css`; modify `app/components/Workspace.tsx` and `README.md`.

**Interfaces:** `KccCalculator({ onClose }: { onClose: () => void })` consumes Task 1's factories/engine/catalog. `KccAreaInput({ value, onChange, id })` edits one `AreaInput`. Workspace owns only `calculator: boolean` and dynamically imports the dialog.

- [x] Implement labeled controls and inline errors, crop rows, season toggles, conversion notes, Reset, Load Excel example, calculated breakdown and annual limits. Fixed-unit/protected labels remain verbatim and carry the approved source-basis review note.
- [x] Add one Settings gear-menu item for branch and admin users, and block other automatic dialogs while calculator is open. No homepage shortcut or separate calculator route.
- [x] Run `npm run typecheck`, targeted Prettier check and `npm run build`; expect success.
- [x] Document access, formula, source basis, ephemeral inputs and beta scope in README.

### Task 3: Browser and final review

**Files:** QA scripts/screenshots outside the repository; update this plan with completed checkboxes.

- [x] Use regular Playwright because the Browser plugin/skill is absent. Start the local app, stub only read APIs in the test browser and perform no real loan writes.
- [x] Verify page identity, meaningful content, no framework overlay, console health, and Settings → KCC calculator → Load Excel example → expected limits.
- [x] Verify district change, unit-change clearing, unknown/alternate karam, season off/on, Reset and Escape dismissal at desktop and 390px mobile widths. Capture desktop/mobile screenshots and check overflow.
- [x] Run the complete suite, typecheck, production build and `git diff --check`.
- [x] Request one fresh whole-change review; resolve material findings with regression tests and repeat affected checks.
- [x] Leave the reviewed change on the local feature branch for user review; do not push or deploy.

## Execution ledger

- Visual follow-up, 26 October 2026: removed the sample-loader button/state/import and workbook introduction at the user's request. Reduced desktop dialog padding from 28px to 14px and phone padding to 10px; tightened crop cards and fields, added green/amber/blue section accents, and emphasized the first-year result. Updated README to describe blank input startup. Existing 63 tests, typecheck, build, formatting, and diff checks passed. In-app browser checks confirmed the removed controls, unchanged live calculation (2.5 acres of Paddy/Wheat gives Year 1 ₹4,00,907.00), Reset, zero console errors, and no overflow at 1280px, 390px, and 360px. Temporary viewport overrides were reset and the user preview left with blank inputs.

- User approved the design and instructed implementation. Executing inline without a second approval round.
- Working in the existing local checkout on `codex/kcc-calculator-beta`, preserving the untracked CLAUDE.md and installed dependencies. The task's desktop context belongs to the parent repository; a managed worktree there would isolate the wrong project.
- Pre-flight: Task 2 consumes Task 1's input/result interfaces; Task 3 validates those same controls/results. No interface conflicts.
- Baseline: 52/52 existing tests passed; TypeScript check passed before implementation.

- Final verification: 63/63 tests, TypeScript check, production build, targeted Prettier and git diff checks passed.
- Final browser QA: Settings-only branch/admin entry, workbook parity, live recalculation, district changes, unit clearing, both karam standards, validation, season toggles, converter, add/remove, reset, Escape, cleared re-open state, 390px/360px layout all passed. No console/page errors or write requests. Bundled Playwright used because Browser plugin is absent; explicitly selected the installed Chromium executable to resolve runtime/browser revision mismatch.
- Final review: fresh reviewer found no Critical/Important issues or actionable minors; independently reconciled all 175 labels and 2,100 district rates with the source workbook.
- Browser fixes verified: bigha conversion now divides integer biswansi by 2000, preventing 0.5349999999999999 in the borrower field; new regression test was observed failing then passing. Scoped annual table styles override existing loan-table mobile rules; mobile header visibility assertion was observed failing then passing.
- Generated next-env.d.ts changes restored; original untracked CLAUDE.md preserved. Feature is local and uncommitted, without push or deployment.
