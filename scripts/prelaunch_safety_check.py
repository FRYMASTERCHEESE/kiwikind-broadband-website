"""Anonymous, read-only KiwiKind prelaunch safety monitor.

Uses only public GET requests; never sends credentials or personal data,
touches payment APIs, writes customer records, or wakes supplier systems.
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
            or status.get("billing_enabled") is not False
            or status.get("live_services") is not False):
        raise PrelaunchCheckError("Public safety alert: intake, services or billing gate changed.")
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
    if "No broadband services currently offered" not in pages[""]:
        raise PrelaunchCheckError("The public website no longer displays prelaunch safeguards.")
    if "No live broadband products" not in pages["terms.html"]:
        raise PrelaunchCheckError("Public prelaunch terms are missing the no-sales statement.")
    return True


def main(fetch=get_text):
    try:
        status = fetch(API + "/api/status")
        plans = fetch(API + "/api/plans")
        pages = {path: fetch(SITE + path) for path in POLICIES}
        validate_public(status, plans, pages)
    except PrelaunchCheckError as exc:
        print("KIWIKIND_PRELAUNCH_CHECK_FAILED: " + str(exc), file=sys.stderr)
        return 1
    print("KIWIKIND_PRELAUNCH_CHECK_PASS: public pages available; no plans, orders or live billing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
