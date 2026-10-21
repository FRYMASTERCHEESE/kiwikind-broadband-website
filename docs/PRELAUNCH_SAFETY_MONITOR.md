# Prelaunch public safety monitoring

GitHub Actions runs lightweight public safety checks twice a day while
KiwiKind is prelaunch, or on an owner-triggered workflow_dispatch.
Pull requests run offline-only tests.

The live check reads the public GitHub Pages home, privacy, terms and
account-deletion pages plus the existing unauthenticated backend
/api/status and /api/plans projections. It allows sleep/retry of free
Render hosting. It never authenticates, touches Stripe, inserts customer
data, sends supplier orders, enables billing or prints private quotes.

The check fails if real public plans, live billing, intake or supplier
orders are accidentally exposed. Workflow failures appear in GitHub
Actions; notification delivery depends on the owner's GitHub settings.
A green workflow is NOT business/legal readiness or an uptime SLA.

Before intentional launch, review the guardrails in a separately approved
release. Keep the current public website on GitHub Pages and private
customer/owner administration on the backend.
