#!/usr/bin/env python3
import csv
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "translations.csv")
NOTE_COL = "note"
TOKEN_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")
PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")


def load(csv_path=CSV_PATH):
    with open(csv_path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return [], []
    header = list(rows[0].keys())
    if header[0] != "token":
        raise SystemExit(f"the first CSV column must be token, got {header[0]}")
    langs = [c for c in header[1:] if c != NOTE_COL]
    return langs, rows


def validate(langs, rows):
    problems = []
    seen = set()
    for i, r in enumerate(rows, start=2):
        token = (r.get("token") or "").strip()
        if not token:
            problems.append(f"row {i}: empty token")
            continue
        if not TOKEN_RE.match(token):
            problems.append(f"{token}: bad name (lowercase, dot-separated, e.g. nav.structure)")
        if token in seen:
            problems.append(f"{token}: registered twice")
        seen.add(token)
        for lang in langs:
            if not (r.get(lang) or "").strip():
                problems.append(f"{token}: missing the {lang} translation")
        want = set(PLACEHOLDER_RE.findall(r.get(langs[0]) or "")) if langs else set()
        for lang in langs[1:]:
            got = set(PLACEHOLDER_RE.findall(r.get(lang) or ""))
            if got != want:
                problems.append(
                    f"{token}: {lang} placeholders differ from {langs[0]} ({sorted(got)} vs {sorted(want)})")
    return problems
