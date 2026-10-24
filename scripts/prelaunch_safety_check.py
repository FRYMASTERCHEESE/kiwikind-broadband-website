"""Anonymous, read-only KiwiKind prelaunch safety monitor.

Uses only public GET requests; never sends credentials or personal data,
writes customer records, or wakes supplier systems. A denied anonymous GET
confirms private payment records still require sign-in.
GitHub Actions failure is an attention signal, not launch approval.
"""
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SITE = "https://frymastercheese.github.io/kiwikind-broadband-website/"
API = "https://kiwikind-backend.onrender.com"
POLICIES = ("", "privacy.html", "terms.html", "account-deletion.html")


class PrelaunchCheckError(RuntimeError):
    pass


def get_text(url, retries=3, delay=6):
    if not url.startswith("https://") or "?" in url or "#" in url:
        raise PrelaunchCheckError("Only fixed public HTTPS endpoints may be checked.")
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "KiwiKind-Prelaunch-Safety/1.0",
                                        "Accept": "application/json, text/html"})
            with urlopen(req, timeout=25) as response:
                if response.status != 200:
                    raise PrelaunchCheckError("Public endpoint returned a non-200 response.")
                content = response.read(500_001)
                if len(content) > 500_000:
                    raise PrelaunchCheckError("Public response exceeded the safety limit.")
                return content.decode("utf-8")
        except (HTTPError, URLError, TimeoutError, UnicodeError, OSError) as exc:
            if attempt + 1 == retries:
                # Never print exception details, server response, usernames or tokens.
                raise PrelaunchCheckError("A required public endpoint could not be read.") from None
            time.sleep(delay)
    raise PrelaunchCheckError("Public endpoint unavailable.")


def validate_public(status_json, plans_json, pages):
    try:
        status = json.loads(status_json)
        plans = json.loads(plans_json)
    except (json.JSONDecodeError, TypeError):
        raise PrelaunchCheckError("Public safety API returned invalid JSON.") from None
    if not isinstance(status, dict) or not isinstance(plans, dict):
        raise PrelaunchCheckError("Unexpected public API response format.")
    if (status.get("mode") != "prelaunch"
            or status.get("intake_enabled") is not False
            or type(status.get("billing_enabled")) is not bool
            or status.get("live_services") is not False):
        raise PrelaunchCheckError("Public safety alert: intake, services or status format changed.")
    if (plans.get("live_orders_enabled") is not False
            or type(plans.get("plans")) is not list
            or plans["plans"]):
        raise PrelaunchCheckError("Public safety alert: plans or supplier orders are available.")
    if not isinstance(pages, dict) or set(pages) != set(POLICIES):
        raise PrelaunchCheckError("Public policy page set incomplete.")
    for path, html in pages.items():
        if not isinstance(html, str) or "<html" not in html.lower():
            raise PrelaunchCheckError("A public policy page did not return HTML.")
        if "KiwiKind Broadband" not in html:
            raise PrelaunchCheckError("A public policy page is not KiwiKind branded.")
    if "Broadband orders are subject to address and connection confirmation" not in pages[""]:
        raise PrelaunchCheckError("The public website no longer explains connection confirmation.")
    if "Confirmation before payment" not in pages["terms.html"]:
        raise PrelaunchCheckError("Public terms are missing the confirmation-before-payment statement.")
    return True


def private_payments_require_signin():
    try:
        with urlopen(Request(API + '/api/payments/summary',
                headers={'User-Agent':'KiwiKind-Prelaunch-Safety/1.0'}), timeout=25):
            return False
    except HTTPError as exc:
        return exc.code == 401
    except (URLError, TimeoutError, OSError):
        return False


def validate_catalogue(raw):
    try:
        data=json.loads(raw)
        assert type(data['products']) is list
        assert data['orders_enabled'] is bool(data['products'])
        assert data['supplier_orders_enabled'] is False
        assert data['payment_timing']=='after_connection_confirmation'
        assert data['gst_included'] is True and data['currency']=='NZD'
        assert 'monthly_addition_cents' not in data and 'setup_addition_cents' not in data
        assert len({p['id'] for p in data['products']})==len(data['products'])
        for product in data['products']:
            q=product['default_quote']
            assert product['price_status']=='verified'
            assert type(q['monthly_cents']) is int and q['monthly_cents']>0
            assert type(q['setup_cents']) is int and q['setup_cents']>=0
            assert q['first_invoice_cents']==q['monthly_cents']+q['setup_cents']
    except (AssertionError,KeyError,TypeError,ValueError):
        raise PrelaunchCheckError('Broadband catalogue, GST additions or confirmation gates changed.') from None
    return True


def main(fetch=get_text, check_private=private_payments_require_signin):
    try:
        status = fetch(API + "/api/status")
        plans = fetch(API + "/api/plans")
        pages = {path: fetch(SITE + path) for path in POLICIES}
        validate_public(status, plans, pages)
        validate_catalogue(fetch(API + '/api/broadband/catalogue'))
        if not check_private():
            raise PrelaunchCheckError('Private payment access could not be verified as requiring sign-in.')
    except PrelaunchCheckError as exc:
        print("KIWIKIND_PRELAUNCH_CHECK_FAILED: " + str(exc), file=sys.stderr)
        return 1
    print("KIWIKIND_PRELAUNCH_CHECK_PASS: public pages available; legacy intake and supplier orders disabled; payments require sign-in and confirmation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
