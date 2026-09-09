#!/usr/bin/env python3
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import text_scan  # noqa: E402


def scan(src, suffix=".js", fn=text_scan.scan_file):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "probe" + suffix)
        with open(p, "w", encoding="utf-8") as f:
            f.write(src)
        return fn(p)


class CjkScannerAllows(unittest.TestCase):
    def test_cjk_in_a_style_block_does_not_count(self):
        self.assertEqual(scan("<style>\n  body { font-family: '苹方'; }\n</style>\n", ".html"),  # cjk-ok: scanner fixture
                         [], "a font name in a style block was flagged as copy")

    def test_cjk_in_a_json_data_block_does_not_count(self):
        self.assertEqual(
            scan('<script type="application/json">\n{"name": "收录"}\n</script>\n', ".html"),  # cjk-ok: scanner fixture
            [], "a JSON data block was flagged as UI copy")

    def test_cjk_in_an_html_comment_does_not_count(self):
        self.assertEqual(scan("<div></div>\n<!-- 这段注释给人看 -->\n", ".html"), [])  # cjk-ok: scanner fixture

    def test_cjk_in_js_line_and_block_comments_does_not_count(self):
        self.assertEqual(scan("const a = 1;\n// 这里解释为什么\n"), [])  # cjk-ok: scanner fixture
        self.assertEqual(scan("/*\n * 多行注释\n * 里的中文\n */\nconst a = 1;\n"), [])  # cjk-ok: scanner fixture

    def test_a_quote_in_a_regex_does_not_swallow_the_next_comment(self):
        self.assertEqual(scan('const esc = /[&<>"]/g;\n// 注释里的中文不该被报\n'), [])  # cjk-ok: scanner fixture


class CjkScannerFires(unittest.TestCase):

    def test_bare_cjk_is_caught(self):
        hits = scan("const label = '确定';\n")  # cjk-ok: scanner fixture
        self.assertEqual(len(hits), 1, "hard-coded Chinese was not caught")
        self.assertEqual(hits[0][0], 1)

    def test_a_double_slash_inside_a_string_is_not_a_comment(self):
        hits = scan("const u = 'http://x'; const label = '确定';\n")  # cjk-ok: scanner fixture
        self.assertEqual(len(hits), 1, "the // in a URL let the hard-coded string on the same line escape")

    def test_scanning_resumes_after_a_block_comment(self):
        self.assertEqual(len(scan("/* 注释 */ const label = '确定';\n")), 1)  # cjk-ok: scanner fixture

    def test_japanese_kana_counts_as_copy(self):
        self.assertEqual(len(scan("const label = 'こんにちは';\n")), 1,  # cjk-ok: scanner fixture
                         "Japanese kana was not treated as copy")

    def test_stripping_regions_keeps_the_line_numbers(self):
        src = ("<style>\n  a { color: red }\n  b { color: blue }\n</style>\n"
               "<script>const label = '确定';</script>\n")  # cjk-ok: scanner fixture
        self.assertEqual([h[0] for h in scan(src, ".html")], [5], "line numbers shifted after the style block was stripped")


class MarkupScanner(unittest.TestCase):
    def markup(self, src):
        return scan(src, ".html", text_scan.scan_markup)

    def test_english_between_tags_is_caught(self):
        self.assertEqual(len(self.markup("<div>Save</div>\n")), 1,
                         "bare English copy in markup was not caught")

    def test_chinese_between_tags_is_caught(self):
        self.assertEqual(len(self.markup("<div>保存</div>\n")), 1)  # cjk-ok: scanner fixture

    def test_elements_marked_skip_are_allowed(self):
        self.assertEqual(self.markup('<span data-i18n-skip>entries.json</span>\n'), [])

    def test_decorative_characters_are_allowed(self):
        self.assertEqual(self.markup("<button>▶</button>\n<i>🚀</i>\n"), [],
                         "a decorative character was flagged as copy")

    def test_script_blocks_are_not_the_markup_scanners_job(self):
        self.assertEqual(self.markup("<script>\nconst a = 'Save';\n</script>\n"), [],
                         "the markup scanner reached into a script block")

    def test_elements_that_take_their_text_from_a_token_are_allowed(self):
        self.assertEqual(self.markup('<div data-i18n="nav.gallery"></div>\n'), [])


class TokenExtraction(unittest.TestCase):
    def test_all_three_spellings_are_recognized(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "p.html")
            with open(p, "w", encoding="utf-8") as f:
                f.write("""<span data-i18n="nav.gallery"></span>
<input data-i18n-placeholder="page.gallery.search_placeholder">
<script>const s = t('form.image'); el.setAttribute('data-i18n', 'common.play');</script>""")
            got = text_scan.used_tokens(p)
        self.assertEqual(got, {"nav.gallery", "page.gallery.search_placeholder",
                               "form.image", "common.play"})

    def test_a_concatenated_prefix_is_not_a_token(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "p.js")
            with open(p, "w", encoding="utf-8") as f:
                f.write("const x = t('form.' + f);\n")
            self.assertEqual(text_scan.used_tokens(p), set())


if __name__ == "__main__":
    unittest.main(verbosity=2)
