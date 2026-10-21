# Accounts on the existing GitHub Pages website

This paired change uses the existing KiwiKind backend APIs and database. Deploy
the backend CORS/session PR before publishing this frontend. Website paths are
`account.html#signin`, `account.html#signup`, `account.html#portal`, and `owner.html`.
The root Pages URL stays unchanged. Public policy pages stay local.

No backend secret or catalogue content is bundled. Owner page source is public;
its data is protected by backend Google owner proof and authenticator MFA.
Cookies stay Secure/HttpOnly on Render; masked CSRF tokens stay in memory. No
session tokens, Google credentials or private records use browser storage.

Run `node --test tests/*.test.cjs` and, after installing Playwright,
`node tests/browser.cjs`. Browser tests use synthetic API responses, not real
Google, Stripe or customer accounts. CI uploads synthetic screenshots only.

Cross-site cookie blocking can prevent login with these unrelated domains. The
UI fails closed and explains the limitation. A per-site cookie exception may be
necessary; universal Safari/mobile persistence is not promised. Every repository
under frymastercheese.github.io shares one browser origin, so all code served
from that account must be trusted.

The owner centre supports readiness, private catalogue display/draft CSV import,
and explicit read-only Stripe TEST evidence checks. Full legacy Django admin
editing and financial actions are not migrated in this iteration. Real Google +
owner MFA, Stripe lifecycle, and signed Android on-device verification remain
release checks. See the backend `docs/PAGES_ACCOUNT_ROLLOUT.md` for exact rollout
order, flags, security boundaries and recovery.
