#!/usr/bin/env python3
import json
import os
import sys
import xml.sax.saxutils as sax

HERE = os.path.dirname(os.path.abspath(__file__))      # code/shared/i18n
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import i18n_table  # noqa: E402

NOTE_COL = i18n_table.NOTE_COL

load = i18n_table.load
validate = i18n_table.validate
PLACEHOLDER_RE = i18n_table.PLACEHOLDER_RE
WEB_DEFAULT_LANG = "en"


def gen_web(langs, rows):
    written = []
    d = os.path.join(PROJECT_ROOT, "code", "web", "locales")
    os.makedirs(d, exist_ok=True)
    for lang in langs:
        p = os.path.join(d, f"{lang}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({r["token"]: r[lang] for r in rows}, f, ensure_ascii=False, indent=2)
            f.write("\n")
        written.append(os.path.relpath(p, PROJECT_ROOT))

    d2 = os.path.join(PROJECT_ROOT, "code", "web", "app")
    os.makedirs(d2, exist_ok=True)
    p2 = os.path.join(d2, "i18n-bundle.js")
    payload = {
        "languages": langs,
        "defaultLang": WEB_DEFAULT_LANG if WEB_DEFAULT_LANG in langs else langs[0],
        "strings": {r["token"]: {lang: r[lang] for lang in langs} for r in rows},
    }
    with open(p2, "w", encoding="utf-8") as f:
        f.write("/* Generated file -- do not edit by hand. Change "
                "code/shared/i18n/translations.csv and re-run "
                "python3 code/shared/i18n/gen-i18n.py */\n")
        f.write("window.AD_I18N = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    written.append(os.path.relpath(p2, PROJECT_ROOT))
    return written


def main():
    check_only = "--check" in sys.argv
    langs, rows = load()
    if not rows:
        raise SystemExit("translations.csv holds no tokens")
    problems = validate(langs, rows)
    if problems:
        print(f"x i18n check failed ({len(problems)} problems):")
        for p in problems:
            print("  -", p)
        return 1
    print(f"ok {len(rows)} tokens x {len(langs)} languages ({', '.join(langs)})")
    if check_only:
        return 0
    written = gen_web(langs, rows)
    print(f"ok wrote {len(written)} site files:")
    for w in written:
        print("  -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
