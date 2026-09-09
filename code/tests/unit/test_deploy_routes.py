#!/usr/bin/env python3
"""vercel.json is the routing table, and it has to match what is on disk.

There used to be a second table inside the local server, and these tests held the
two in step. The local server reads vercel.json now, so that drift is gone and what
is left to check is the config against the filesystem: add a page, forget the
rewrite, and the file sits there while the URL 404s -- seen for real on 2026-09-09,
when /pages/demo.html returned 200 and / returned 404.

Nothing below names a page or a directory. Both lists come from the filesystem, so a
page added tomorrow is covered without editing this file.
"""
import json
import os
import unittest
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import WEB, read_text  # noqa: E402

VERCEL = os.path.join(WEB, "vercel.json")
PAGE_DIR = os.path.join(WEB, "pages")


def pages_on_disk():
    """{route: file} for every page, e.g. {"demo": "demo.html"}."""
    return {os.path.splitext(f)[0]: f
            for f in sorted(os.listdir(PAGE_DIR)) if f.endswith(".html")}


class DeployRoutes(unittest.TestCase):
    def setUp(self):
        cfg = json.loads(read_text(VERCEL))
        self.rewrites = {r["source"]: r["destination"] for r in cfg.get("rewrites", [])}
        self.redirects = {r["source"]: r["destination"] for r in cfg.get("redirects", [])}
        self.pages = pages_on_disk()
        self.assertTrue(self.pages, "no pages found on disk; the path is wrong")

    def test_every_page_on_disk_has_a_clean_route(self):
        missing = [f"/{route}" for route, page in self.pages.items()
                   if self.rewrites.get(f"/{route}") != f"/pages/{page}"]
        self.assertEqual(missing, [], f"pages on disk with no route: {missing}")

    def test_the_root_serves_a_page_that_exists(self):
        """A static host has no notion of a default page; without this, `/` is a 404."""
        dest = self.rewrites.get("/")
        self.assertIsNotNone(dest, "/ has no rewrite, so the site root 404s")
        self.assertIn(dest.rsplit("/", 1)[-1], set(self.pages.values()),
                      f"/ serves {dest}, which is not a page on disk")

    def test_no_rewrite_points_at_a_missing_file(self):
        """A rewrite aimed at a file that is gone is a silent 404."""
        stale = [f"{s} -> {d}" for s, d in self.rewrites.items()
                 if ":path*" not in d and not os.path.isfile(os.path.join(WEB, d.lstrip("/")))]
        self.assertEqual(stale, [], f"rewrites pointing at files that do not exist: {stale}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
