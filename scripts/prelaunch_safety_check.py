"""Anonymous, read-only KiwiKind public safety monitor.

Checks production endpoint availability, internal catalogue consistency, account
privacy and disabled live supplier orders. A published catalogue is NOT proof
that Vetta's wholesale sources, download/upload speeds or charges are correct.
No login, customer write, supplier order, checkout or payment is performed.
"""
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SITE = "https://frymastercheese.github.io/kiwikind-broadband-website/"
API = "https://kiwikind-backend.onrender.com"
POLICIES = ("", "privacy.html", "terms.html", "account-deletion.html")
TRANSIENT_HTTP = (429, 500, 502, 503, 504)
PRIVATE_FIELDS = {
    "base", "basesetup", "payload", "source_ref", "source_monthly_cents",
    "source_setup_cents", "monthly_addition_cents", "setup_addition_cents",
    "approved_by", "approved_digest",
}


class PrelaunchCheckError(RuntimeError):
    pass


def get_text(url, retries=5, delay=8):
    """Retry Render cold starts, never turn a persistent outage into a PASS."""
    if not url.startswith("https://") or "?" in url or "#" in url:
        raise PrelaunchCheckError("Only fixed public HTTPS endpoints may be checked.")
    for attempt in range(retries):
        try:
            request = Request(url, headers={
                "User-Agent": "KiwiKind-Public-Safety/2.0",
                "Accept": "application/json, text/html",
            })
            with urlopen(request, timeout=35) as response:
                if response.status != 200:
                    raise PrelaunchCheckError("Public endpoint returned a non-200 response.")
                body = response.read(500_001)
                if len(body) > 500_000:
                    raise PrelaunchCheckError("Public response exceeded the safety limit.")
                return body.decode("utf-8")
        except HTTPError as exc:
            if exc.code not in TRANSIENT_HTTP:
                raise PrelaunchCheckError(
                    "A required public endpoint returned HTTP " + str(exc.code) + "."
                ) from None
        except (URLError, TimeoutError, UnicodeError, OSError):
            pass
        if attempt + 1 < retries:
            time.sleep(delay)
    raise PrelaunchCheckError(
        "A required public endpoint remained unavailable after retries."
    )


def parse_json(raw, label):
    try:
        parsed = json.loads(raw)
        if type(parsed) is dict:
            return parsed
    except (json.JSONDecodeError, TypeError, UnicodeError):
        pass
    raise PrelaunchCheckError(label + " returned invalid JSON.")


def validate_public(status_json, plans_json, pages):
    status = parse_json(status_json, "Public status")
    compatibility = parse_json(plans_json, "Compatibility catalogue")
    if (status.get("mode") != "prelaunch"
            or status.get("intake_enabled") is not False
            or status.get("live_services") is not False
            or status.get("supplier_orders_enabled") is not False
            or status.get("availability") != "unverified"
            or status.get("payment_timing") != "after_connection_confirmation"
            or type(status.get("broadband_ordering_enabled")) is not bool
            or type(status.get("billing_enabled")) is not bool):
        raise PrelaunchCheckError(
            "Public safety alert: service, billing or supplier ordering gates changed."
        )
    # Nonempty catalogue projections are legitimate for owner-published offers.
    # They must still pass validate_catalogue against the live source API.
    if (compatibility.get("live_orders_enabled") is not False
            or type(compatibility.get("plans")) is not list):
        raise PrelaunchCheckError("Compatibility catalogue or live supplier orders changed.")
    if not isinstance(pages, dict) or set(pages) != set(POLICIES):
        raise PrelaunchCheckError("Public policy page set incomplete.")
    for html in pages.values():
        if not isinstance(html, str) or "<html" not in html.lower():
            raise PrelaunchCheckError("A public policy page did not return HTML.")
        if "KiwiKind Broadband" not in html:
            raise PrelaunchCheckError("A public policy page is not KiwiKind branded.")
    if "Broadband orders are subject to address and connection confirmation" not in pages[""]:
        raise PrelaunchCheckError("Website no longer explains connection confirmation.")
    if "Confirmation before payment" not in pages["terms.html"]:
        raise PrelaunchCheckError("Public terms lack the confirmation-before-payment statement.")
    return True


def _no_private_fields(value):
    if type(value) is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise PrelaunchCheckError("Unexpected public catalogue key.")
            key_lower = key.lower()
            if (key_lower in PRIVATE_FIELDS or key_lower.startswith("source_")
                    or key_lower.startswith("wholesale_")):
                raise PrelaunchCheckError("Private supplier data appeared in a public response.")
            _no_private_fields(item)
    elif type(value) is list:
        for item in value:
            _no_private_fields(item)


def _nonempty(value):
    return type(value) is str and bool(value.strip())


def _money(value, zero_ok):
    return type(value) is int and (value >= 0 if zero_ok else value > 0)


def validate_catalogue(raw, plans_json=None):
    """Check exact client projections, not unverifiable supplier source claims."""
    catalogue = parse_json(raw, "Shared broadband catalogue")
    products = catalogue.get("products")
    if (type(products) is not list
            or type(catalogue.get("orders_enabled")) is not bool
            or catalogue["orders_enabled"] != bool(products)
            or catalogue.get("supplier_orders_enabled") is not False
            or catalogue.get("payment_timing") != "after_connection_confirmation"
            or catalogue.get("gst_included") is not True
            or catalogue.get("currency") != "NZD"):
        raise PrelaunchCheckError("Broadband publication or supplier order gates changed.")
    _no_private_fields(catalogue)
    version = catalogue.get("catalogue_version")
    if products and not _nonempty(version):
        raise PrelaunchCheckError("Published catalogue is missing its release version.")

    by_id = {}
    names = set()
    for product in products:
        if type(product) is not dict:
            raise PrelaunchCheckError("Invalid public broadband product.")
        identifier, name = product.get("id"), product.get("name")
        if (not _nonempty(identifier) or not _nonempty(name)
                or identifier in by_id or name.casefold() in names
                or product.get("price_status") != "verified"
                or product.get("price_confirmation_required") is not True
                or not _nonempty(product.get("allowance"))
                or not _nonempty(product.get("terms"))
                or not _money(product.get("headline_monthly_cents"), False)):
            raise PrelaunchCheckError("Unverified, duplicate or incomplete public product.")
        names.add(name.casefold())
        groups = product.get("groups")
        if type(groups) is not list or not groups:
            raise PrelaunchCheckError("Published product is missing its choices.")
        default = product.get("default_quote")
        if (type(default) is not dict
                or default.get("product_id") != identifier
                or default.get("catalogue_version") != version
                or default.get("quote_complete") is not True
                or default.get("price_confirmation_required") is not True
                or default.get("gst_included") is not True
                or default.get("currency") != "NZD"
                or default.get("allowance") != product["allowance"]
                or default.get("terms") != product["terms"]):
            raise PrelaunchCheckError("Incomplete or outdated public default quote.")
        monthly = default.get("monthly_cents")
        setup = default.get("setup_cents")
        first = default.get("first_invoice_cents")
        if not (_money(monthly, False) and _money(setup, True)
                and _money(first, False) and monthly + setup == first):
            raise PrelaunchCheckError("Monthly, setup and first-payment totals differ.")
        selections = default.get("selections")
        if type(selections) is not list or len(selections) != len(groups):
            raise PrelaunchCheckError("Public default quote does not match option groups.")
        for group, selection in zip(groups, selections):
            if (type(group) is not dict or not _nonempty(group.get("id"))
                    or not _nonempty(group.get("label"))
                    or type(group.get("options")) is not list
                    or not group["options"]):
                raise PrelaunchCheckError("Invalid service choice group.")
            choices = group["options"]
            ids = [o.get("id") for o in choices if type(o) is dict]
            if (len(ids) != len(choices) or not all(map(_nonempty, ids))
                    or len(set(ids)) != len(ids) or selection not in ids):
                raise PrelaunchCheckError("Default quote selects an invalid service option.")
        by_id[identifier] = product

    if plans_json is not None:
        other = parse_json(plans_json, "Compatibility catalogue")
        plans = other.get("plans")
        if (other.get("live_orders_enabled") is not False
                or type(plans) is not list or len(plans) != len(products)):
            raise PrelaunchCheckError("Website/Android catalogue projections differ.")
        seen = set()
        for plan in plans:
            if type(plan) is not dict or not _nonempty(plan.get("id")):
                raise PrelaunchCheckError("Invalid Android catalogue product.")
            identifier = plan["id"]
            if identifier in seen or identifier not in by_id:
                raise PrelaunchCheckError("Website/Android product IDs differ.")
            seen.add(identifier)
            product = by_id[identifier]
            quote = product["default_quote"]
            if (plan.get("name") != product["name"]
                    or plan.get("retail_monthly_cents") != quote["monthly_cents"]
                    or plan.get("retail_setup_cents") != quote["setup_cents"]
                    or plan.get("first_invoice_cents") != quote["first_invoice_cents"]
                    or plan.get("allowance") != product["allowance"]
                    or plan.get("terms") != product["terms"]
                    or plan.get("currency") != "NZD"
                    or plan.get("gst_included") is not True
                    or plan.get("address_availability") != "unverified"):
                raise PrelaunchCheckError("Website/Android rates or allowances differ.")
        _no_private_fields(other)
    return True


def private_payments_require_signin(retries=5, delay=8):
    """Only an explicit HTTP 401 proves anonymous billing remains private."""
    for attempt in range(retries):
        try:
            with urlopen(Request(
                API + "/api/payments/summary",
                headers={"User-Agent": "KiwiKind-Public-Safety/2.0"},
            ), timeout=35):
                return False
        except HTTPError as exc:
            if exc.code == 401:
                return True
            if exc.code not in TRANSIENT_HTTP:
                return False
        except (URLError, TimeoutError, OSError):
            pass
        if attempt + 1 < retries:
            time.sleep(delay)
    return False


def main(fetch=get_text, check_private=private_payments_require_signin):
    try:
        status_json = fetch(API + "/api/status")
        plans_json = fetch(API + "/api/plans")
        pages = {path: fetch(SITE + path) for path in POLICIES}
        validate_public(status_json, plans_json, pages)
        validate_catalogue(fetch(API + "/api/broadband/catalogue"), plans_json)
        if not check_private():
            raise PrelaunchCheckError(
                "Private payment access could not be verified as requiring sign-in."
            )
    except PrelaunchCheckError as exc:
        print("KIWIKIND_PRELAUNCH_CHECK_FAILED: " + str(exc), file=sys.stderr)
        return 1
    print(
        "KIWIKIND_PRELAUNCH_CHECK_PASS: public site, matching plan projections, "
        "NZD/GST totals, disabled supplier orders and private payment access checked. "
        "Independent Vetta source accuracy and permission to launch are NOT verified."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
