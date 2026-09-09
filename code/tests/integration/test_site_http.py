#!/usr/bin/env python3
import json
import os
import sys
import unittest
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import SITE, SITE_UP, entries, get  # noqa: E402

ROUTES = ["demo", "about"]


@unittest.skipUnless(SITE_UP, "the site is not running (start it with ./start.sh and re-run)")
class SiteRoutes(unittest.TestCase):
    def test_the_root_is_the_full_screen_demo(self):
        """The demo is the home page: the bare domain is the star field, no hop."""
        status, body, _ = get(f"{SITE}/", allow_redirect=False)
        self.assertEqual(status, 200, "/ does not serve the demo directly")
        self.assertIn('class="demo"', body, "/ is not the demo page")

    def test_both_pages_serve_and_inject_the_prefix_script(self):
        for route in ROUTES:
            status, body, _ = get(f"{SITE}/{route}")
            self.assertEqual(status, 200, f"/{route} is not available")
            self.assertIn("app/shell.js", body, f"/{route} does not load the shell")

    def test_an_unknown_route_404s_instead_of_falling_back(self):
        status, _, _ = get(f"{SITE}/nope")
        self.assertEqual(status, 404)

    def test_the_content_source_is_fetchable_and_parses(self):
        status, body, _ = get(f"{SITE}/data/entries.json")
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)["entries"]), len(entries()["entries"]))

    def test_every_page_writes_its_own_state_into_the_url(self):
        expected = {
            "demo": ["panel"],
        }
        for route, keys in expected.items():
            _, body, _ = get(f"{SITE}/{route}")
            for key in keys:
                self.assertIn(f"AD_setParam('{key}'", body,
                              f'/{route} does not write "{key}" into the url, so a refresh loses it')

    def test_the_shell_writes_the_language_into_the_url(self):
        _, shell, _ = get(f"{SITE}/app/shell.js")
        self.assertIn("history.replaceState", shell)
        self.assertIn("AD_setParam('lang'", shell)


if __name__ == "__main__":
    unittest.main(verbosity=2)
