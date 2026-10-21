"""Offline-only tests: never contact live site or payment accounts."""
import json
import unittest

from scripts.prelaunch_safety_check import (
    API, SITE, POLICIES, PrelaunchCheckError, main, validate_public,
)

STATUS = json.dumps({
    "mode": "prelaunch", "intake_enabled": False,
    "billing_enabled": False, "live_services": False,
})
PLANS = json.dumps({"plans": [], "live_orders_enabled": False})
PAGES = {path: (
    "<!doctype html><html><body>KiwiKind Broadband " +
    ("No live broadband products" if path == "terms.html" else "") +
    ("No broadband services currently offered" if path == "" else "") +
    "</body></html>"
) for path in POLICIES}


class PrelaunchSafetyChecks(unittest.TestCase):
    def test_fresh_prelaunch_passes(self):
        self.assertTrue(validate_public(STATUS, PLANS, PAGES))

    def test_fails_if_live_billing_or_intake_turns_on(self):
        for key in ("intake_enabled", "billing_enabled", "live_services"):
            changed = json.loads(STATUS)
            changed[key] = True
            with self.subTest(key=key), self.assertRaises(PrelaunchCheckError):
                validate_public(json.dumps(changed), PLANS, PAGES)

    def test_fails_if_any_public_plans_or_supplier_orders_enabled(self):
        for changed in (
            {"plans": [{"name": "Unapproved synthetic plan"}],
             "live_orders_enabled": False},
            {"plans": [], "live_orders_enabled": True},
        ):
            with self.assertRaises(PrelaunchCheckError):
                validate_public(STATUS, json.dumps(changed), PAGES)

    def test_missing_or_replaced_policy_fails(self):
        for key in POLICIES:
            changed = dict(PAGES)
            changed.pop(key)
            with self.subTest(key=key), self.assertRaises(PrelaunchCheckError):
                validate_public(STATUS, PLANS, changed)
        changed = dict(PAGES)
        changed["terms.html"] = "<html>KiwiKind Broadband</html>"
        with self.assertRaises(PrelaunchCheckError):
            validate_public(STATUS, PLANS, changed)

    def test_fail_closed_on_invalid_or_unexpected_json(self):
        for status, plans in (
            ("not-json", PLANS),
            (STATUS, "not-json"),
            ("[]", PLANS),
            (STATUS, '{"plans":null,"live_orders_enabled":false}'),
        ):
            with self.assertRaises(PrelaunchCheckError):
                validate_public(status, plans, PAGES)

    def test_fetch_only_public_https_read_endpoints(self):
        touched = []
        data = {API + "/api/status": STATUS, API + "/api/plans": PLANS}
        data.update({SITE + path: value for path, value in PAGES.items()})

        def fake_fetch(url):
            touched.append(url)
            return data[url]

        self.assertEqual(main(fetch=fake_fetch), 0)
        self.assertEqual(len(touched), 6)
        self.assertTrue(all(url.startswith("https://") for url in touched))
        self.assertFalse(any("checkout" in url or "webhook" in url or
                             "admin" in url or "customer" in url for url in touched))


if __name__ == "__main__":
    unittest.main()
