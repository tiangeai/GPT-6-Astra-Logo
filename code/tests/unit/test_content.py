#!/usr/bin/env python3
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import ROOT, ENTRIES, WEB, entries, read_text  # noqa: E402


class Entries(unittest.TestCase):
    def setUp(self):
        self.doc = entries()
        self.list = self.doc["entries"]

    def test_the_named_entries_are_present(self):
        ids = [e["id"] for e in self.list]
        for want in ["gpt-6-astra"]:
            self.assertIn(want, ids, f"the required entry {want} is missing")

    def test_entry_fields_are_complete(self):
        for e in self.list:
            for key in ["id", "category", "figure", "titleToken", "taglineToken",
                        "summaryToken", "forms", "params", "controls",
                        "math", "language", "origin", "sourceUrl", "year"]:
                self.assertIn(key, e, f"{e.get('id')} is missing the field {key}")
            self.assertIn(e["category"], self.doc["categories"], e["id"])

    def test_every_entry_declares_the_declared_forms(self):
        for e in self.list:
            self.assertEqual(sorted(e["forms"]), sorted(self.doc["forms"]),
                             f"{e['id']} does not declare the full set of forms")

    def test_slider_params_exist_and_their_defaults_are_in_range(self):
        for e in self.list:
            for c in e["controls"]:
                self.assertIn(c["key"], e["params"],
                              f"{e['id']} slider {c['key']} has no matching parameter")
                v = e["params"][c["key"]]
                self.assertGreaterEqual(v, c["min"], f"{e['id']}.{c['key']} default is below the minimum")
                self.assertLessEqual(v, c["max"], f"{e['id']}.{c['key']} default is above the maximum")
                self.assertLess(c["min"], c["max"], f"{e['id']}.{c['key']} has min and max the wrong way round")

    def test_params_referenced_by_the_math_blocks_exist(self):
        for e in self.list:
            for b in e["math"]:
                self.assertTrue(b["formula"].strip(), f"{e['id']}/{b['id']} has no formula")
                for s in b.get("show", []):
                    if "key" in s:
                        self.assertIn(s["key"], e["params"],
                                      f"{e['id']}/{b['id']} references a parameter that does not exist: {s['key']}")
                    self.assertTrue("key" in s or "der" in s,
                                    f"{e['id']}/{b['id']}: {s['sym']} is neither a parameter nor a derived value")

    def test_no_natural_language_in_the_formulas(self):
        import re
        cjk = re.compile(r"[぀-ヿ㐀-䶿一-鿿]")  # cjk-ok: scanner fixture
        bad = []
        for e in self.list:
            for b in e["math"]:
                if cjk.search(b["formula"]):
                    bad.append(f"{e['id']}/{b['id']}")
        self.assertEqual(bad, [], f"natural language leaked into the formulas: {bad}")

    def test_every_entry_separates_verified_from_rebuilt(self):
        for e in self.list:
            self.assertTrue(e["origin"]["verifiedTokens"], f"{e['id']} lists nothing as verifiable")
            self.assertTrue(e["origin"]["reconstructedTokens"], f"{e['id']} lists nothing as rebuilt")
            self.assertTrue(e["sourceUrl"].startswith("http"), f"{e['id']} has no source link")

    def test_every_entry_has_a_design_language(self):
        for e in self.list:
            self.assertGreaterEqual(len(e["language"]["principleTokens"]), 3,
                                    f"{e['id']} has fewer than 3 design-language notes")
            self.assertTrue(e["language"]["swatches"], f"{e['id']} has no swatches")

    def test_the_figure_module_exists(self):
        for e in self.list:
            js = os.path.join(WEB, "app", "figures", e["figure"] + ".js")
            self.assertTrue(os.path.isfile(js), f"{e['id']} figure module is missing: {js}")

    def test_params_live_only_in_the_source_of_truth(self):
        import re
        base = os.path.join(WEB, "app", "figures")
        for e in self.list:
            mods = [f for f in sorted(os.listdir(base))
                    if f.endswith(".js") and (f == e["figure"] + ".js"
                                              or f.startswith(e["figure"] + "-"))]
            self.assertTrue(mods, f"{e['id']}: no figure module found")
            for fn in mods:
                src = read_text(os.path.join(base, fn))
                leaked = [k for k in e["params"]
                          if re.search(r"\b" + re.escape(k) + r"\s*[:=]\s*[-\d]", src)]
                self.assertEqual(leaked, [],
                                 f"{fn} hard-codes default parameters: {leaked} (the source of truth is {ENTRIES})")


    def test_no_image_gif_or_video_pipeline(self):
        """The live page is the only form. Nothing here produces a file.

        The still, the GIF and the video used to exist twice over: a Python pipeline
        under code/shared/media committing 7.5 MB of binaries that had to be kept in
        step with entries.json by hand, and an in-page exporter that re-encoded the
        same three forms from the visitor's own parameters. Both were removed on
        2026-09-09; what is left draws to the screen and nowhere else.
        """
        self.assertFalse(os.path.isdir(os.path.join(ROOT, "code", "shared", "media")),
                         "the offline render pipeline is back")
        self.assertFalse(os.path.isfile(os.path.join(WEB, "app", "export.js")),
                         "in-page export is back; the site ships only the live interactive page")
        self.assertFalse(os.path.isdir(os.path.join(WEB, "assets", "media")),
                         "pre-rendered artifacts were committed again")

    def test_the_content_source_registers_no_artifacts_or_render_params(self):
        """`media` means committed files; `render` means something renders offline."""
        for e in self.list:
            self.assertNotIn("media", e, f"{e['id']} registers pre-rendered artifacts again")
            self.assertNotIn("render", e, f"{e['id']} registers offline render parameters again")


if __name__ == "__main__":
    unittest.main(verbosity=2)
