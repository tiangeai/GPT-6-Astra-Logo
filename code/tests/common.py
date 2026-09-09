#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))            # code/tests
ROOT = os.path.dirname(os.path.dirname(HERE))
WEB = os.path.join(ROOT, "code", "web")
ENTRIES = os.path.join(WEB, "data", "entries.json")
CSV = os.path.join(ROOT, "code", "shared", "i18n", "translations.csv")

# The default in dev-server.js; override both with PORT.
PORT = int(os.environ.get("PORT", "3021"))
SITE = f"http://127.0.0.1:{PORT}"


def read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def entries():
    with open(ENTRIES, encoding="utf-8") as f:
        return json.load(f)


def languages():
    text = read_text(os.path.join(ROOT, "context.yaml"))
    start = text.find("程序化支持多语言:")  # cjk-ok: scanner fixture
    langs, seen = [], False
    for raw in text[start:].splitlines()[1:]:
        if raw and not raw.startswith(" "):
            break
        m = re.match(r"^\s+-\s+([\w-]+)\s*$", raw)
        if m:
            langs.append(m.group(1))
            seen = True
        elif seen and raw.strip() and not raw.strip().startswith("-"):
            break
    return langs


LANGS = languages()


def page_files():
    out = []
    for base, dirs, files in os.walk(WEB):
        dirs[:] = [d for d in dirs if d not in ("locales", "assets")]
        for fn in sorted(files):
            if fn.endswith((".html", ".js")) and fn != "i18n-bundle.js":
                out.append(os.path.join(base, fn))
    return out


def get(url, timeout=3, allow_redirect=True):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener() if allow_redirect else \
        urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(url, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace"), r.headers.get("Location")
    except urllib.error.HTTPError as e:
        with e:
            return e.code, e.read().decode("utf-8", "replace"), e.headers.get("Location")


def site_up():
    try:
        get(f"{SITE}/", timeout=1)
        return True
    except Exception:
        return False


SITE_UP = site_up()
