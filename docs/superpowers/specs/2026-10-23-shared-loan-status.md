# Shared fresh Agriculture status

User approved proceeding with the proposal: Agri gains Returned, and linked fresh Agriculture applications use one Pending/Sanctioned/Returned status in both apps. Status changes require the existing signed Agri admin session. Returning requires a reason and date; resubmission explicitly moves the same record back to Pending. Remarks and status history survive transitions.

Canonical status, return reason/date and sanction date live in Supabase. Nirnay keeps officer assignments and other workflow fields, but its linked status and decision dates are projections of the canonical record. Both API paths reject stale versions and unauthenticated decision changes. Renewals retain their existing two-status behavior; historical records are not bulk imported.

Correct the reported borrower's exact branch/name/amount match by attaching the original returned Firebase identity to the existing eligible Agri record and adopting its original returned date/reason. Preserve original Firebase documents and existing remarks/history. Before new shared creation, check existing Nirnay Agriculture entries across all statuses. Existing matches require explicit selection or confirmation of a distinct application; attaching an unlinked historical identity requires admin authentication and exact branch/name/amount agreement.

Verify bidirectional return, sanction, resubmission and protected status changes; retained history and reasons; pending counts excluding returned records; stale conflicts; all-status duplicate selection; one the reported borrower row in Returned; no unrelated data changes. Deploy both apps and service, then remove synthetic verification records.
