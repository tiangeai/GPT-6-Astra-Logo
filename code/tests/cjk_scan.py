#!/usr/bin/env python3
"""No CJK anywhere in Python and shell sources -- strings included, not just comments.

A comment-only rule was not enough. Chinese kept surviving inside string literals:
an assertion message, a SystemExit, a `print`, or the banner a generator writes into
a file it ships. Those are all read by whoever gets handed the repo, so the rule
here is the whole line, not the comment.

Web assets are out of scope on purpose. They carry translated copy by design -- the
generated bundle is six languages of it -- so a whole-line rule cannot apply there,
and hard-coded copy in the hand-written pages is text_scan's job.

Fixtures are the one real exception -- the CJK scanners have to be fed CJK -- so a
line ending in `cjk-ok` is allowed through. That marker is the only way out, which
means `grep -rn cjk-ok` lists every exception in the tree.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import text_scan  # noqa: E402

CJK = text_scan.CJK
ALLOW = "cjk-ok"
SOURCE = (".py", ".sh")


def scan_file(path, text=None):
    """Every line carrying CJK, unless the line waives the rule."""
    if text is None:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    return [(no, line.strip()) for no, line in enumerate(text.split("\n"), 1)
            if CJK.search(line) and ALLOW not in line]


def scan_paths(paths):
    result = {}
    for p in paths:
        hits = scan_file(p)
        if hits:
            result[os.path.basename(p)] = hits
    return result


def source_files(root, subdirs):
    """Every Python and shell file the rule applies to, generated output included."""
    out = []
    for sub in subdirs:
        base = os.path.join(root, sub)
        if os.path.isfile(base):
            out.append(base)
            continue
        for cur, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ("__pycache__", "node_modules")]
            for fn in sorted(files):
                if fn.endswith(SOURCE):
                    out.append(os.path.join(cur, fn))
    return out


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(HERE))
    found = scan_paths(source_files(root, ["code", "start.sh", "run-tests.sh"]))
    for name, hits in sorted(found.items()):
        print(f"\n-- {name} ({len(hits)} lines with CJK)")
        for no, line in hits[:20]:
            print(f"   {no}: {line[:100]}")
    print(f"\nTotal: {sum(len(h) for h in found.values())} lines in {len(found)} files")
    sys.exit(1 if found else 0)
