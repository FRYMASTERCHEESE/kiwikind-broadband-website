"""Offline-only regression tests: never open Vetta, accounts or real payment sessions."""
import copy
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from io import BytesIO

from scripts.prelaunch_safety_check import (
    API, SITE, POLICIES, PrelaunchCheckError, get_text, main,
    validate_public, validate_catalogue,
)

STATUS = json.dumps({
    "mode": "prelaunch", "intake_enabled": False,
    "billing_enabled": True, "live_services": False,
    "broadband_ordering_enabled": True,
    "supplier_orders_enabled": False, "availability": "unverified",
    "payment_timing": "after_connection_confirmation",
})
EMPTY_PLANS = json.dumps({"plans": [], "live_orders_enabled": False})
EMPTY_CATALOGUE = {
    "products": [], "catalogue_version": "unpublished",
    "orders_enabled": False, "supplier_orders_enabled": False,
    "payment_timing": "after_connection_confirmation",
    "gst_included": True, "currency": "NZD",
}
PAGES = {path: (
    "<!doctype html><html><body>KiwiKind Broadband "
    + ("Confirmation before payment" if path == "terms.html" else "")
    + ("Broadband orders are subject to address and connection confirmation"
       if path == "" else "")
    + "</body></html>"
) for path in POLICIES}


def published():
    quote = {
        "currency": "NZD", "gst_included": True, "quote_complete": True,
        "price_confirmation_required": True,
        "product_id": "synthetic-fibre", "catalogue_version": "synthetic-v1",
        "monthly_cents": 12000, "setup_cents": 3000,
        "first_invoice_cents": 15000,
        "selections": ["transfer"],
        "allowance": "Synthetic uncapped allowance",
        "terms": "Synthetic conditions. Connection requires confirmation.",
    }
    product = {
        "id": "synthetic-fibre", "name": "Synthetic Fibre",
        "family": "ufb",
        "headline_monthly_cents": 12000,
        "price_status": "verified", "price_confirmation_required": True,
        "allowance": quote["allowance"], "terms": quote["terms"],
        "groups": [{"id": "connection", "label": "Connection type",
                    "options": [{"id": "transfer", "name": "Transfer"}]}],
        "default_quote": quote,
    }
    catalogue = {
        **EMPTY_CATALOGUE,
        "products": [product], "catalogue_version": "synthetic-v1",
        "orders_enabled": True,
    }
    old_projection = {
        "live_orders_enabled": False,
        "plans": [{
            "id": product["id"], "name": product["name"],
            "retail_monthly_cents": 12000, "retail_setup_cents": 3000,
            "first_invoice_cents": 15000, "currency": "NZD",
            "gst_included": True, "address_availability": "unverified",
            "allowance": product["allowance"], "terms": product["terms"],
        }],
    }
    return catalogue, old_projection


class PrelaunchSafetyChecks(unittest.TestCase):
    def test_empty_catalogue_and_private_status_pass(self):
        self.assertTrue(validate_public(STATUS, EMPTY_PLANS, PAGES))
        self.assertTrue(validate_catalogue(json.dumps(EMPTY_CATALOGUE), EMPTY_PLANS))

    def test_published_consistent_catalogue_is_monitored_not_automatically_rejected(self):
        catalogue, plans = published()
        self.assertTrue(validate_public(STATUS, json.dumps(plans), PAGES))
        self.assertTrue(validate_catalogue(json.dumps(catalogue), json.dumps(plans)))

    def test_no_live_supplier_orders_or_public_service_activation(self):
        for field, value in (
            ("intake_enabled", True), ("live_services", True),
            ("supplier_orders_enabled", True), ("availability", "available"),
            ("payment_timing", "immediate"),
        ):
            changed = json.loads(STATUS)
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(PrelaunchCheckError):
                validate_public(json.dumps(changed), EMPTY_PLANS, PAGES)
        for changed in (
            {"plans": [], "live_orders_enabled": True},
            {"plans": "not a list", "live_orders_enabled": False},
        ):
            with self.assertRaises(PrelaunchCheckError):
                validate_public(STATUS, json.dumps(changed), PAGES)

    def test_private_billing_toggle_does_not_enable_service(self):
        changed = json.loads(STATUS)
        changed["billing_enabled"] = False
        self.assertTrue(validate_public(json.dumps(changed), EMPTY_PLANS, PAGES))

    def test_missing_or_replaced_policy_pages_fail(self):
        for path in POLICIES:
            changed = dict(PAGES)
            changed.pop(path)
            with self.subTest(path=path), self.assertRaises(PrelaunchCheckError):
                validate_public(STATUS, EMPTY_PLANS, changed)
        changed = dict(PAGES)
        changed["terms.html"] = "<html>KiwiKind Broadband</html>"
        with self.assertRaises(PrelaunchCheckError):
            validate_public(STATUS, EMPTY_PLANS, changed)

    def test_invalid_or_unexpected_public_status_json_fail(self):
        for status, plans in (
            ("not-json", EMPTY_PLANS),
            (STATUS, "not-json"),
            ("[]", EMPTY_PLANS),
            (STATUS, '{"plans":null,"live_orders_enabled":false}'),
        ):
            with self.assertRaises(PrelaunchCheckError):
                validate_public(status, plans, PAGES)

    def test_published_unverified_duplicates_and_missing_terms_fail(self):
        base, plans = published()
        for edit in (
            lambda x: x["products"][0].update(price_status="unverified"),
            lambda x: x["products"][0].update(allowance=""),
            lambda x: x["products"][0].update(headline_monthly_cents=0),
            lambda x: x["products"].append(copy.deepcopy(x["products"][0])),
            lambda x: x["products"][0]["default_quote"].update(quote_complete=False),
            lambda x: x["products"][0]["default_quote"].update(
                catalogue_version="stale"
            ),
            lambda x: x["products"][0]["default_quote"].update(
                setup_cents=None
            ),
            lambda x: x["products"][0]["default_quote"].update(
                first_invoice_cents=1
            ),
            lambda x: x["products"][0]["default_quote"].update(
                selections=["nonexistent"]
            ),
        ):
            changed = copy.deepcopy(base)
            edit(changed)
            with self.assertRaises(PrelaunchCheckError):
                validate_catalogue(json.dumps(changed), json.dumps(plans))

    def test_price_data_leaks_are_rejected_even_if_balances_match(self):
        base, plans = published()
        for location, key in (
            ("top", "source_ref"),
            ("product", "wholesale_ex_gst"),
            ("quote", "source_monthly_cents"),
            ("option", "baseSetup"),
        ):
            changed = copy.deepcopy(base)
            if location == "top":
                changed[key] = "private"
            elif location == "product":
                changed["products"][0][key] = "private"
            elif location == "quote":
                changed["products"][0]["default_quote"][key] = 123
            else:
                changed["products"][0]["groups"][0]["options"][0][key] = 5
            with self.subTest(location=location), self.assertRaises(PrelaunchCheckError):
                validate_catalogue(json.dumps(changed), json.dumps(plans))

    def test_different_web_android_monthly_setup_usage_and_ids_fail(self):
        catalogue, plans = published()
        for key, value in (
            ("retail_monthly_cents", 1),
            ("retail_setup_cents", 0),
            ("first_invoice_cents", 1),
            ("allowance", "wrong"),
            ("id", "other-product"),
            ("address_availability", "verified"),
        ):
            different = copy.deepcopy(plans)
            different["plans"][0][key] = value
            with self.subTest(key=key), self.assertRaises(PrelaunchCheckError):
                validate_catalogue(json.dumps(catalogue), json.dumps(different))

    def test_wrong_catalogue_flags_gst_and_currency_fail(self):
        catalogue, plans = published()
        for key, value in (
            ("supplier_orders_enabled", True),
            ("orders_enabled", False),
            ("payment_timing", "immediate"),
            ("gst_included", False),
            ("currency", "USD"),
            ("monthly_addition_cents", 400),
        ):
            modified = copy.deepcopy(catalogue)
            modified[key] = value
            with self.subTest(key=key), self.assertRaises(PrelaunchCheckError):
                validate_catalogue(json.dumps(modified), json.dumps(plans))

    def test_only_fixed_public_get_urls_and_denied_payment_access(self):
        touched = []
        data = {API + "/api/status": STATUS, API + "/api/plans": EMPTY_PLANS,
                API + "/api/broadband/catalogue": json.dumps(EMPTY_CATALOGUE)}
        data.update({SITE + path: value for path, value in PAGES.items()})

        def fake_fetch(url):
            touched.append(url)
            return data[url]

        self.assertEqual(main(fetch=fake_fetch, check_private=lambda: True), 0)
        self.assertEqual(main(fetch=fake_fetch, check_private=lambda: False), 1)
        self.assertEqual(len(touched), 14)
        self.assertTrue(all(url.startswith("https://") for url in touched))
        self.assertFalse(any("/checkout" in u or "/webhook" in u
                             or "/admin" in u or "/customer" in u for u in touched))

    def test_transient_503_is_retried_and_permanent_failure_does_not_pass(self):
        class Response:
            status = 200
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self, _):
                return b'{"ok":true}'

        temporary = HTTPError(API + "/api/status", 503, "temporary", None, None)
        with patch("scripts.prelaunch_safety_check.urlopen",
                   side_effect=[temporary, Response()]), patch(
                       "scripts.prelaunch_safety_check.time.sleep"
                   ) as sleeping:
            self.assertEqual(get_text(API + "/api/status", retries=2), '{"ok":true}')
            sleeping.assert_called_once()

        with patch("scripts.prelaunch_safety_check.urlopen",
                   side_effect=HTTPError(API, 503, "unavailable", None, None)), patch(
                       "scripts.prelaunch_safety_check.time.sleep"
                   ):
            with self.assertRaises(PrelaunchCheckError):
                get_text(API + "/api/status", retries=2)

    def test_private_endpoint_401_is_not_treated_as_normal_page_failure(self):
        with patch("scripts.prelaunch_safety_check.urlopen",
                   side_effect=HTTPError(API, 401, "denied", None, None)):
            with self.assertRaises(PrelaunchCheckError):
                get_text(API + "/api/status", retries=3)


if __name__ == "__main__":
    unittest.main()
