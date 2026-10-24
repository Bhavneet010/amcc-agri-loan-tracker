# Linked deletion and simpler remarks

User explicitly requested removing the shared history sections, saving Nirnay remarks without a password, and deleting a linked loan from both apps. Implement inline on dedicated branches; no repeat approval needed.

- [x] Remove history rendering from Agri and Nirnay loan editors while retaining existing audit storage. Allow Nirnay remark creation/updates without an admin cookie; keep decision authentication.
- [x] Add failing tests for password-free remarks and deletion visibility. Add a CLI-generated migration with a server-only visibility helper used by both deletion paths, undo and explicit re-linking. Keep version checks, stable identity and audit storage; reconcile prior one-sided deletions without deleting unrelated data.
- [x] Verify full suites, Agri typecheck/build, transactional rollback cases and browser flows for both delete directions, Undo, remarks without cookies, hidden history sections and protected status changes. Obtain independent review, deploy both apps and service, and remove synthetic verification records.

Deletion removes a linked application from both active lists. Undo in Nirnay restores it in both apps. Original Firebase identities must stay suppressed after deletion; internal retained records must never reappear as an editable Firebase fallback. Unlinked historical records and other categories retain their current behavior.

Verification so far: Agri 39 tests, typecheck and production build passed; Nirnay 89 tests and module syntax passed. Live database rollback checks verified both deletion directions, Undo, explicit re-linking, retry safety and retained Firebase identity. Local browser flow passed without runtime errors. Independent review found no material issues. Both frontends are deployed to production: Agri eb014ac, Nirnay 25a84ad. The live browser flow passed all eight checks, including remarks without an admin session, both deletion directions and Undo. Removed both synthetic loans and four test notifications; all 45 visible Agri records and all six retained shared records exactly match the pre-change backup.
