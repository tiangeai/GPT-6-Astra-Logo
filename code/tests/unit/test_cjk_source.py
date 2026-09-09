#!/usr/bin/env python3
"""Python and shell sources carry no CJK at all -- comments, docstrings and strings.

The comment rule alone was not enough. Chinese kept surviving inside string
literals, where a comment scanner is blind by design: assertion messages across
the test suite, the validation errors in the i18n table, every line the launcher
prints, and the banner the i18n generator wrote into the bundle the site serves.

Nothing here names a file. The scope is checked against the files git tracks, so
a source file added tomorrow is covered without editing this test, and one that
falls out of scope fails it.
"""
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cjk_scan  # noqa: E402
from common import ROOT  # noqa: E402

SUBDIRS = ["code", "start.sh", "run-tests.sh"]


def tracked_sources():
    """Every Python and shell file git tracks -- an index built by something else."""
    r = subprocess.run(["git", "ls-files", "-z", "*.py", "*.sh"],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        return None
    return {p for p in r.stdout.split("\0") if p}


class PythonAndShellSource(unittest.TestCase):
    def test_no_cjk_in_python_or_shell(self):
        found = cjk_scan.scan_paths(cjk_scan.source_files(ROOT, SUBDIRS))
        detail = "; ".join(f'{n}:{h[0][0]} "{h[0][1][:40]}" ({len(h)} in all)'
                           for n, h in found.items())
        self.assertEqual(found, {}, f"CJK in source: {detail}")

    def test_scope_covers_every_source_file_git_tracks(self):
        """The sweep passes trivially over files it never opened."""
        tracked = tracked_sources()
        if tracked is None:
            self.skipTest("not a git checkout")
        scanned = {os.path.relpath(p, ROOT)
                   for p in cjk_scan.source_files(ROOT, SUBDIRS)}
        self.assertTrue(tracked, "git tracks no source files; the query is wrong")
        self.assertEqual(tracked - scanned, set(),
                         "tracked source files are outside the scanner's reach")

    def test_every_waiver_states_a_reason(self):
        """A waiver has to say why, so the exceptions stay readable in a grep."""
        for path in cjk_scan.source_files(ROOT, SUBDIRS):
            with open(path, encoding="utf-8") as f:
                for no, line in enumerate(f.read().split("\n"), 1):
                    if cjk_scan.ALLOW not in line:
                        continue
                    reason = line.split(cjk_scan.ALLOW, 1)[1].lstrip(": ").strip()
                    self.assertTrue(reason, f"{os.path.relpath(path, ROOT)}:{no} "
                                            f"waives the rule without saying why")


class Fires(unittest.TestCase):
    """Each one must go red if the scanner stops working."""

    def test_a_chinese_comment_fires(self):
        self.assertEqual(len(cjk_scan.scan_file("<t>", "x = 1  # 说明\n")), 1)  # cjk-ok: scanner fixture

    def test_a_chinese_assertion_message_fires(self):
        src = 'self.assertTrue(x, "端口必须是奇数")\n'  # cjk-ok: scanner fixture
        self.assertEqual(len(cjk_scan.scan_file("<t>", src)), 1)

    def test_a_chinese_docstring_fires(self):
        src = 'def f():\n    """说明。"""\n    return 1\n'  # cjk-ok: scanner fixture
        self.assertEqual(len(cjk_scan.scan_file("<t>", src)), 1)

    def test_a_banner_written_into_generated_output_fires(self):
        src = 'f.write("/* 生成物，勿手改 */")\n'  # cjk-ok: scanner fixture
        self.assertEqual(len(cjk_scan.scan_file("<t>", src)), 1)

    def test_a_shell_trailing_comment_fires(self):
        """A comment scanner that only reads whole-line comments misses this one."""
        src = 'kill_port() { # 占用即 kill\n  ls\n}\n'  # cjk-ok: scanner fixture
        self.assertEqual(len(cjk_scan.scan_file("<t>", src)), 1)

    def test_japanese_kana_fires(self):
        self.assertEqual(len(cjk_scan.scan_file("<t>", "label = 'こんにちは'\n")), 1)  # cjk-ok: scanner fixture

    def test_english_passes(self):
        self.assertEqual(cjk_scan.scan_file("<t>", "x = 1  # a note\n"), [])

    def test_a_marked_line_is_waived(self):
        src = "label = '确定'  # cjk-ok: scanner fixture\n"  # cjk-ok: scanner fixture
        self.assertEqual(cjk_scan.scan_file("<t>", src), [])


if __name__ == "__main__":
    unittest.main()
