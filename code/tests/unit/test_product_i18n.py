#!/usr/bin/env python3
import csv
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import text_scan  # noqa: E402
from common import (CSV, LANGS, ROOT, WEB, entries, page_files,
                    read_text)  # noqa: E402


def registered():
    with open(CSV, encoding="utf-8", newline="") as f:
        return {r["token"] for r in csv.DictReader(f)}


class SourceOfTruth(unittest.TestCase):
    def test_all_six_required_languages_are_in_the_table(self):
        with open(CSV, encoding="utf-8", newline="") as f:
            header = next(csv.reader(f))
        self.assertEqual(header[0], "token", "the first column of the table must be token")
        langs = [c for c in header[1:] if c != "note"]
        self.assertEqual(langs, LANGS, f"the language columns must match context.yaml: {LANGS}")
        self.assertEqual(len(LANGS), 6, "six languages are required")

    def test_no_translation_is_missing(self):
        with open(CSV, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        missing = [f"{r['token']}:{l}" for r in rows for l in LANGS
                   if not (r.get(l) or "").strip()]
        self.assertEqual(missing, [], f"missing translations: {missing}")

    def test_the_site_locales_match_the_table(self):
        bundle = read_text(os.path.join(WEB, "app", "i18n-bundle.js"))
        data = json.loads(bundle[bundle.index("{"):bundle.rindex("}") + 1])
        self.assertEqual(data["languages"], LANGS)
        self.assertEqual(len(data["strings"]), len(registered()),
                         "the bundle and the CSV disagree on row count; re-run gen-i18n.py")

    def test_every_language_has_its_own_bundle(self):
        for lang in LANGS:
            p = os.path.join(WEB, "locales", f"{lang}.json")
            self.assertTrue(os.path.isfile(p), f"the {lang} bundle is missing")


class NoHardCodedCopy(unittest.TestCase):
    def test_no_cjk_literals_in_the_page_source(self):
        found = text_scan.scan_paths(page_files())
        detail = "; ".join(f"{n} line {h[0][0]} ({len(h)} in all)" for n, h in found.items())
        self.assertEqual(found, {}, f"hard-coded copy found: {detail}")

    def test_no_bare_copy_in_the_markup(self):
        html = [f for f in page_files() if f.endswith(".html")]
        found = text_scan.scan_paths(html, text_scan.scan_markup)
        detail = "; ".join(f'{n}:{h[0][0]} "{h[0][1]}" ({len(h)} in all)' for n, h in found.items())
        self.assertEqual(found, {}, f"markup carries text that does not go through a token: {detail}")

    def test_tokens_used_by_the_pages_are_registered(self):
        reg = registered()
        missing = set()
        for f in page_files():
            missing |= {u for u in text_scan.used_tokens(f) if u not in reg}
        self.assertEqual(sorted(missing), [], f"unregistered tokens are referenced: {sorted(missing)}")

    def test_tokens_used_by_the_content_source_are_registered(self):
        reg = registered()
        missing = []
        for e in entries()["entries"]:
            toks = [e["titleToken"], e["taglineToken"], e["summaryToken"],
                    e["language"]["paletteToken"]]
            toks += e["language"]["principleTokens"]
            toks += e["origin"]["verifiedTokens"] + e["origin"]["reconstructedTokens"]
            toks += [c["labelToken"] for c in e["controls"]]
            for b in e["math"]:
                toks += [b["titleToken"], b["varsToken"], b["noteToken"]]
            missing += [t for t in toks if t not in reg]
        self.assertEqual(sorted(set(missing)), [], f"unregistered tokens: {sorted(set(missing))}")

    def test_dynamically_built_token_families_are_complete(self):
        reg = registered()
        families = (
            [f"nav.{n}" for n in ("demo",)]
            + [f"lang.endonym.{l.replace('-', '_').lower()}" for l in LANGS]
        )
        self.assertEqual([f for f in families if f not in reg], [])

    def test_every_page_uses_the_shared_shell(self):
        for name in ["demo.html", "about.html"]:
            src = read_text(os.path.join(WEB, "pages", name))
            self.assertIn('src="app/shell.js"', src, f"{name} does not load the shell")
            self.assertIn('src="app/i18n-bundle.js"', src, f"{name} does not load the language bundle")
            self.assertNotIn("window.AD_BASE = ", src, f"{name} inlines its own copy of the shell script again")

    def test_every_page_can_switch_language(self):
        """A page with six languages and no way to pick one supports one language.

        The full-screen demo shipped exactly like that: the picker lived in the header,
        the header only exists on the write-up page, and once the demo became the home
        page there was no switcher on the page most people land on.
        """
        for name in ["demo.html", "about.html"]:
            src = read_text(os.path.join(WEB, "pages", name))
            self.assertTrue("AD_langPicker" in src or 'id="ad-header"' in src,
                            f"{name} has no language picker, so six translations never reach a reader")

    def test_one_implementation_of_the_language_picker(self):
        """One implementation in the shell. Pages that each build their own picker
        drift apart on the option list and on writing the language into the URL.
        """
        shell = read_text(os.path.join(WEB, "app", "shell.js"))
        self.assertIn("window.AD_langPicker = function", shell)
        for name in ["demo.html", "about.html"]:
            src = read_text(os.path.join(WEB, "pages", name))
            self.assertNotIn("createElement('select')", src, f"{name} builds a second picker of its own")

    def test_the_default_is_english_and_the_browser_is_not_consulted(self):
        """A visitor who was sent a link must see the page that link shows.

        Sniffing navigator.language made the same URL render differently per visitor,
        which is exactly what the URL-carries-the-state rule exists to prevent.
        Order is URL, then the visitor's own earlier choice, then English.
        """
        shell = read_text(os.path.join(WEB, "app", "shell.js"))
        self.assertNotIn("navigator.language", shell, "the browser language is being consulted again")
        self.assertIn("return BUNDLE.defaultLang;", shell, "there is no fallback to the default language")
        bundle = read_text(os.path.join(WEB, "app", "i18n-bundle.js"))
        data = json.loads(bundle[bundle.index("{"):bundle.rindex("}") + 1])
        self.assertEqual(data["defaultLang"], "en", "the default language must be English")

    def test_the_language_choice_goes_into_the_url(self):
        shell = read_text(os.path.join(WEB, "app", "shell.js"))
        self.assertIn("AD_setParam('lang'", shell, "switching language does not write to the url")
        self.assertIn("AD_getParam('lang')", shell, "the language is not restored from the url")
        self.assertIn("history.replaceState", shell, "url state is not updated with replaceState")

    def test_numbers_are_formatted_per_language(self):
        shell = read_text(os.path.join(WEB, "app", "shell.js"))
        self.assertIn("toLocaleString", shell, "numbers are not localized per language")


class SiteStyles(unittest.TestCase):
    def test_hidden_is_not_overridden_by_a_utility_display_rule(self):
        css = read_text(os.path.join(WEB, "app", "site.css"))
        self.assertRegex(css, r"\[hidden\]\s*\{[^}]*display:\s*none\s*!important",
                         "the stylesheet does not pin [hidden] down")
        forced = re.search(r"\[hidden\][^{]*\{[^}]*\}", css)
        first_display_class = re.search(r"\.btn\s*\{[^}]*display:", css)
        self.assertTrue(forced and first_display_class
                        and forced.start() < first_display_class.start(),
                        "the [hidden] rule must come before the utility classes or it is overridden")


if __name__ == "__main__":
    unittest.main(verbosity=2)
