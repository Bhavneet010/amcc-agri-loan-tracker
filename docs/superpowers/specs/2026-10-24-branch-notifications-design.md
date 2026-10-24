# Branch loan update popup

The user approved the recommended centered popup, grouped by loan, with separate acknowledgement on each phone. Show borrower, ATS, full remarks, status transition, return reason and India-local change time for the selected branch. Include Nirnay changes to linked loans. Capture only new updates after activation, for both fresh loans and renewals; do not replay existing history or add password requirements.

Use a new database update trigger to record meaningful remark/decision changes atomically with the loan write. Initial inserts, no-op saves, branch compliance changes, deletion and restoration do not create alerts. Existing loan history alone cannot cover renewals; comparing local snapshots misses changes made while the app is closed. An indexed event feed covers both.

Use a random installation ID retained in browser storage and server acknowledgement rows keyed by installation and event. This provides per-phone read tracking without staff accounts and avoids ever-growing local event lists or timestamp cursors that can skip concurrently committed updates. Clearing site storage creates a new installation. Reusing the same installation across branch switches retains each branch's read state.

Fetch unread events after branch selection/session resolution and on resume, refresh and a visible-page interval. Display at most 50 events at a time, grouped by loan. Mark as read acknowledges only the displayed IDs, then loads any remaining events. Later/close postpones without acknowledgement until the next open/resume. Do not compete with loan editors, settings, login or installation prompts. Errors must not block normal loan use or falsely mark updates read.

Tables and RPC functions are service-only, use RLS and security invoker. Existing public branch access remains the access model. The API validates branch/installation IDs and limits acknowledgement batches. Hidden/deleted loans do not produce active notifications; branch moves must not reveal a prior branch's events. No change to Nirnay or existing loan mutation semantics is required.
