# i18n — the single source of truth for copy

## Rules

1. **No hard-coded copy.** Source files may contain tokens (`nav.demo`) and nothing
   else — no literal text, in any language.
2. **`translations.csv` is the source of truth.** A platform-neutral table: first
   column is the token, then one column per supported language, and a final `note`
   column giving translators the context.
3. **Register before you build.** The order is: define the feature → register the
   token and its translations → refer to the token from code.
4. **Native mechanisms only.** `gen-i18n.py` turns the CSV into each platform's own
   resource format; no cross-platform i18n library at runtime.

## Languages

`en`, `zh-Hans`, `ja`, `es`, `de`, `fr` (BCP-47). Adding one means adding a column to
the CSV and re-running the generator.

## Generating

```bash
python3 code/shared/i18n/gen-i18n.py            # generate the web resources
python3 code/shared/i18n/gen-i18n.py --check    # validate only, writes nothing (CI and tests)
```

Output (generated — never edit by hand):

| Platform | Output | Read at runtime as |
|----------|--------|--------------------|
| Web | `code/web/locales/<lang>.json` + `code/web/app/i18n-bundle.js` | `t('token')` |

This project is web-only, so only web resources are generated. The source table and its
parser are platform-neutral: another platform needs one more generator function, nothing
more.

## Placeholders

ICU-style `{name}` everywhere — for example `{done}` and `{total}` in
`page.demo.exporting`. Every language must use exactly the same placeholders, and a
token that takes them must explain them in its `note`.

## Validation

`--check` exits non-zero on:

- a token missing a translation in some language;
- a token name that isn't lowercase and dot-separated;
- a duplicate token.
