#!/usr/bin/env python3
import os
import re
import sys

CJK = re.compile(r"[぀-ヿ㐀-䶿一-鿿]")  # cjk-ok: scanner fixture
GENERATED = {"i18n-bundle.js"}


def _blank(text, start, end):
    return text[:start] + re.sub(r"[^\n]", " ", text[start:end]) + text[end:]


def _strip_regions(text):
    for pat in (
        re.compile(r"<style\b[^>]*>.*?</style>", re.S | re.I),
        re.compile(r"<script\b[^>]*type\s*=\s*[\"']application/json[\"'][^>]*>.*?</script>",
                   re.S | re.I),
        re.compile(r"<!--.*?-->", re.S),
    ):
        while True:
            m = pat.search(text)
            if not m:
                break
            text = _blank(text, m.start(), m.end())
    return text


def _strip_js_comments(text):
    out = list(text)
    i, n, quote = 0, len(text), None
    while i < n:
        c = text[i]
        if quote:
            if c == "\n" and quote in "\"'":
                quote = None
                i += 1
                continue
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'`":
            quote = c
            i += 1
            continue
        if c == "/" and i + 1 < n:
            nxt = text[i + 1]
            if nxt == "/":
                j = text.find("\n", i)
                j = n if j < 0 else j
                for k in range(i, j):
                    out[k] = " "
                i = j
                continue
            if nxt == "*":
                j = text.find("*/", i + 2)
                j = n if j < 0 else j + 2
                for k in range(i, j):
                    if out[k] != "\n":
                        out[k] = " "
                i = j
                continue
        i += 1
    return "".join(out)


def scan_file(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    cleaned = _strip_js_comments(_strip_regions(text))
    return [(no, line.strip()) for no, line in enumerate(cleaned.split("\n"), 1)
            if CJK.search(line)]


_SKIP_ELEMENT = re.compile(r"<(\w+)[^>]*\bdata-i18n-skip\b[^>]*>.*?</\1>", re.S | re.I)


def scan_markup(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    text = _strip_regions(text)
    while True:
        m = re.search(r"<script\b[^>]*>.*?</script>", text, re.S | re.I)
        if not m:
            break
        text = _blank(text, m.start(), m.end())
    while True:
        m = _SKIP_ELEMENT.search(text)
        if not m:
            break
        text = _blank(text, m.start(), m.end())

    hits = []
    for m in re.finditer(r">([^<>]+)<", text):
        chunk = m.group(1).strip()
        if chunk and any(c.isalpha() for c in chunk):
            hits.append((text.count("\n", 0, m.start()) + 1, chunk[:110]))
    return hits


def scan_paths(paths, fn=scan_file):
    result = {}
    for p in paths:
        if os.path.basename(p) in GENERATED:
            continue
        hits = fn(p)
        if hits:
            result[os.path.basename(p)] = hits
    return result


def used_tokens(path):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    used = set(re.findall(r"\bt\(\s*'([a-z][a-z0-9_.]*)'", src))
    used |= set(re.findall(
        r"data-i18n(?:-html|-placeholder|-title|-aria|-content)?=\"([a-z][a-z0-9_.]*)\"", src))
    used |= set(re.findall(
        r"setAttribute\('data-i18n[a-z-]*',\s*'([a-z][a-z0-9_.]*)'\)", src))
    return {u for u in used if not u.endswith(".")}


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    from common import page_files                              # noqa: E402

    files = page_files()
    total = 0
    for name, hits in scan_paths(files).items():
        print(f"\n-- {name} ({len(hits)} CJK literals)")
        for no, line in hits:
            print(f"  {no:>5}: {line[:110]}")
            total += 1
    mtotal = 0
    for name, hits in scan_paths([f for f in files if f.endswith(".html")], scan_markup).items():
        print(f"\n-- {name} ({len(hits)} bare strings in markup)")
        for no, chunk in hits:
            print(f"  {no:>5}: {chunk}")
            mtotal += 1
    print(f"\nTotal: {total} CJK literals, {mtotal} bare strings in markup")
    sys.exit(1 if (total or mtotal) else 0)
