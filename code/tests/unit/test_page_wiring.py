#!/usr/bin/env python3
"""Every button a page renders must actually be wired to something.

Found the hard way on 2026-09-09: the demo page shipped #reset and #togglePanel as
real, styled, translated buttons that no code ever bound. Nothing failed -- the
buttons were there, spelled right in six languages, and clicking them did nothing.
No existing test could see it: the i18n tests check tokens, the HTTP tests check
routes, and neither one asks whether a control does anything.

Only <button> is checked. Anchors get their href assigned in loops over id arrays,
which a per-id scan cannot follow without guessing; buttons in this codebase are
always bound directly, so a missing binding here is a real defect and not a style.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import WEB, read_text  # noqa: E402

BUTTON = re.compile(r"<button\b[^>]*\bid=\"([A-Za-z0-9_-]+)\"")
PAGES = ["demo.html", "about.html"]


def bound(src, el_id):
    """True when the page binds a handler to that element."""
    pattern = re.compile(
        r"getElementById\(\s*'" + re.escape(el_id) + r"'\s*\)\s*\.\s*(onclick|addEventListener)")
    return bool(pattern.search(src))


class PageWiring(unittest.TestCase):
    def test_every_button_has_a_handler(self):
        dead = []
        for name in PAGES:
            src = read_text(os.path.join(WEB, "pages", name))
            for el_id in BUTTON.findall(src):
                if not bound(src, el_id):
                    dead.append(f"{name}#{el_id}")
        self.assertEqual(dead, [], f"buttons are rendered but nothing handles them: {dead}")

    def test_the_sweep_actually_finds_buttons(self):
        """The sweep above passes trivially if the regex stops matching."""
        src = read_text(os.path.join(WEB, "pages", "demo.html"))
        found = BUTTON.findall(src)
        self.assertIn("reset", found, "the button sweep did not find reset, so the rule is not actually running")
        self.assertGreaterEqual(len(found), 2)

    def test_an_unbound_button_is_reported(self):
        """Fire test: an unbound button must be reported."""
        self.assertFalse(bound('<button id="ghost"></button>', "ghost"))
        self.assertTrue(bound("document.getElementById('ghost').onclick = f;", "ghost"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
